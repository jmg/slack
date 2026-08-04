import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requireWaUser } from "@/lib/wpp/api";
import { requireCanSend } from "@/lib/wpp/data";
import {
  buildChatContext,
  serializeWaMessage,
  waMessageInclude,
} from "@/lib/wpp/messages";
import { broadcastMessage, markDeliveredToConnected } from "@/lib/wpp/realtime";
import { waCreatePollSchema } from "@/lib/wpp/validators";

type Params = { params: Promise<{ chatId: string }> };

/**
 * Post a poll.
 *
 * A poll *is* a message — same send rules, same cursors, same broadcast — so
 * this mirrors the message route rather than inventing a second send path. The
 * message, the poll and its options are written together: a POLL message whose
 * options failed to commit would render as a question nobody can answer, and
 * there is no repair path for it once the bubble is in everyone's history.
 */
export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { chatId } = await params;

    const limited = rateLimit(`wpp:poll:${me.id}:${clientIp(req)}`, 30, 60 * 1000);
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "error.rateLimited" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
      );
    }

    const member = await requireCanSend(me.id, chatId);

    const parsed = waCreatePollSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "validate.invalidInput");
    }
    const { question, options, allowMultiple } = parsed.data;

    // Two options a voter reads as the same answer would split the tally between
    // them, and the result would be unreadable. Case-insensitive because "Yes"
    // and "yes" are the same answer to everyone but the database.
    const distinct = new Set(options.map((text) => text.toLowerCase()));
    if (distinct.size !== options.length) {
      return apiError("validate.invalidInput");
    }

    const created = await prisma.$transaction(async (tx) => {
      const message = await tx.waMessage.create({
        data: {
          chatId,
          senderId: me.id,
          kind: "POLL",
          // The question doubles as the chat-list preview, which reads `body`.
          body: question,
        },
      });

      await tx.waPoll.create({
        data: {
          messageId: message.id,
          question,
          allowMultiple,
          // Nested create: the options are part of the poll's definition, not a
          // follow-up write that could be lost between two statements.
          options: {
            create: options.map((text, position) => ({ text, position })),
          },
        },
      });

      await tx.waChat.update({
        where: { id: chatId },
        data: { lastMessageAt: message.createdAt },
      });

      // Sending is reading: your own poll must never come back as unread, and
      // the draft the composer was holding is spent.
      await tx.waChatMember.update({
        where: { chatId_userId: { chatId, userId: me.id } },
        data: {
          lastReadAt: message.createdAt,
          lastDeliveredAt: message.createdAt,
          draft: null,
          archivedAt: null,
        },
      });

      return message;
    });

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
