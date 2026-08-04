import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requireWaUser } from "@/lib/wpp/api";
import { requireCanSend, requireChatMember } from "@/lib/wpp/data";
import {
  buildChatContext,
  listChatMessages,
  serializeWaMessage,
  waMessageInclude,
} from "@/lib/wpp/messages";
import { claimWaAttachments } from "@/lib/wpp/uploads";
import { broadcastMessage, markDeliveredToConnected } from "@/lib/wpp/realtime";
import { waSendMessageSchema } from "@/lib/wpp/validators";
import { attachmentKind } from "@/lib/wpp/upload-limits";
import { resolveMentions } from "@/lib/wpp/mentions";
import type { WaMessageKind } from "@/generated/prisma/enums";

type Params = { params: Promise<{ chatId: string }> };

/** A page of a chat's history, oldest-first. `?before=<id>` pages backwards. */
export async function GET(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const me = await requireWaUser();
    const { chatId } = await params;
    const member = await requireChatMember(me.id, chatId);

    const before = req.nextUrl.searchParams.get("before") ?? undefined;
    const page = await listChatMessages(
      { id: chatId, type: member.chat.type },
      me,
      { clearedAt: member.clearedAt, before },
    );

    return NextResponse.json(page);
  });
}

/**
 * Send a message.
 *
 * The message row, the attachment claim and the chat's sort key all move in one
 * transaction: a message never ships half-attached, and the chat list can never
 * order by a timestamp for a message that failed to commit.
 */
export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { chatId } = await params;

    // Generous, but enough to stop a runaway client hammering a chat.
    const limited = rateLimit(`wpp:send:${me.id}:${clientIp(req)}`, 120, 60 * 1000);
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "error.rateLimited" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
      );
    }

    const member = await requireCanSend(me.id, chatId);

    const parsed = waSendMessageSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "validate.invalidInput");
    }
    const { body, replyToId, attachmentIds } = parsed.data;

    // A reply may only quote a message from the same chat — otherwise a quote
    // would leak a message the recipients were never allowed to see.
    if (replyToId) {
      const quoted = await prisma.waMessage.findUnique({
        where: { id: replyToId },
        select: { chatId: true },
      });
      if (!quoted || quoted.chatId !== chatId) {
        throw new ApiError("error.notFound", 404);
      }
    }

    // The message kind comes from what's attached: a photo message renders as a
    // photo, and a recording (the only upload carrying a waveform) as a voice
    // note. Text with no attachment stays TEXT.
    let kind: WaMessageKind = "TEXT";
    if (attachmentIds?.length) {
      const pending = await prisma.waAttachment.findMany({
        where: {
          id: { in: attachmentIds },
          uploaderId: me.id,
          messageId: null,
          purpose: "MESSAGE",
        },
        select: { id: true, contentType: true, waveform: true },
      });
      if (pending.length !== new Set(attachmentIds).size) {
        throw new ApiError("error.attachmentsUnavailable", 400);
      }
      // Pick by the composer's own ordering, not by whatever the planner
      // returned first. The bubble renders attachments in `createdAt` order, so
      // an arbitrary pick here can persist a `kind` that disagrees with the
      // attachment the message actually leads with — and the preview would then
      // say "Photo" for a message whose first attachment is a PDF.
      const byId = new Map(pending.map((a) => [a.id, a]));
      const first = byId.get(attachmentIds[0]) ?? pending[0];
      kind = attachmentKind(first.contentType, {
        voice: first.waveform !== null,
      }) as WaMessageKind;
    }

    // Who this message names with `@`. Resolved against the chat's own
    // participants, so an "@ada" in a chat Ada isn't in mentions nobody — and
    // stored as rows rather than re-derived later, because display names change
    // and the unread badge has to be an indexed count, not a body scan.
    const trimmed = body.trim();
    let mentionedIds: string[] = [];
    if (trimmed.includes("@")) {
      const participants = await prisma.waChatMember.findMany({
        where: { chatId, leftAt: null, userId: { not: me.id } },
        select: { userId: true, user: { select: { name: true } } },
      });
      mentionedIds = resolveMentions(
        trimmed,
        participants.map((p) => ({ id: p.userId, name: p.user.name })),
      );
    }

    // Disappearing messages: the timer is read *now* and burned into the row.
    // Evaluating it at read time instead would make changing the timer
    // retroactively delete history that was sent under the old setting.
    const disappearing = member.chat.disappearingSeconds;

    const created = await prisma.$transaction(async (tx) => {
      const message = await tx.waMessage.create({
        data: {
          chatId,
          senderId: me.id,
          kind,
          body: trimmed,
          replyToId: replyToId ?? null,
          expiresAt: disappearing
            ? new Date(Date.now() + disappearing * 1000)
            : null,
          ...(mentionedIds.length > 0
            ? { mentions: { create: mentionedIds.map((userId) => ({ userId })) } }
            : {}),
        },
      });

      await claimWaAttachments(tx, {
        attachmentIds,
        userId: me.id,
        messageId: message.id,
        chatId,
      });

      await tx.waChat.update({
        where: { id: chatId },
        data: { lastMessageAt: message.createdAt },
      });

      // Sending is reading: your own message must never come back as unread,
      // and the draft it came from is spent.
      await tx.waChatMember.update({
        where: { chatId_userId: { chatId, userId: me.id } },
        data: {
          lastReadAt: message.createdAt,
          lastDeliveredAt: message.createdAt,
          draft: null,
          // Sending into an archived chat pulls it back out, like WhatsApp.
          archivedAt: null,
        },
      });

      return message;
    });

    // Reads already filter on `expiresAt`, so expiry is guaranteed regardless of
    // this — but a "disappearing" message that merely stops rendering while the
    // row lives on forever isn't disappearing. Sweeping the chat we just wrote
    // to is bounded, needs no cron, and runs exactly where the data churns.
    if (disappearing) {
      await prisma.waMessage
        .deleteMany({ where: { chatId, expiresAt: { lte: new Date() } } })
        .catch((err) => console.error("wpp: disappearing sweep failed", err));
    }

    await broadcastMessage(chatId);
    await markDeliveredToConnected(chatId, me.id);

    const row = await prisma.waMessage.findUniqueOrThrow({
      where: { id: created.id },
      include: waMessageInclude,
    });
    const ctx = await buildChatContext({ id: chatId, type: member.chat.type }, me);

    return NextResponse.json(serializeWaMessage(row, ctx));
  });
}
