import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requireWaUser } from "@/lib/wpp/api";
import { requireCanSend, requireMessageAccess } from "@/lib/wpp/data";
import { broadcastMessage, markDeliveredToConnected } from "@/lib/wpp/realtime";
import { waForwardSchema } from "@/lib/wpp/validators";

type Params = { params: Promise<{ messageId: string }> };

/**
 * Forward a message into other chats.
 *
 * Each destination gets its own new message rather than a reference to the
 * original: the recipients are not members of the source chat and must never be
 * able to reach it. That's also why the reply is dropped — a quote would carry a
 * message from a conversation they were never part of.
 *
 * `forwardScore` climbs by one per hop, which is what eventually renders the
 * "Forwarded many times" label (FORWARD_MANY_THRESHOLD in lib/wpp/config.ts).
 */
export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { messageId } = await params;

    // One forward can fan out to 20 chats, so the ceiling is lower than send's.
    const limited = rateLimit(`wpp:forward:${me.id}:${clientIp(req)}`, 30, 60 * 1000);
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "error.rateLimited" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
      );
    }

    const source = await requireMessageAccess(me.id, messageId);
    if (source.deletedAt) throw new ApiError("error.notFound", 404);
    // System messages describe one group's history; they mean nothing anywhere
    // else and have no body to carry.
    if (source.kind === "SYSTEM") throw new ApiError("error.forbidden", 400);
    // Deleted for this caller: it isn't on their screen, so it can't be the
    // thing they asked to forward.
    const hidden = await prisma.waMessageHide.findUnique({
      where: { messageId_userId: { messageId, userId: me.id } },
      select: { id: true },
    });
    if (hidden) throw new ApiError("error.notFound", 404);

    const parsed = waForwardSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "validate.invalidInput");
    }
    const chatIds = [...new Set(parsed.data.chatIds)];

    // Check every destination before writing any of them, so a forward to five
    // chats can't half-succeed because the fourth one turned out to be blocked.
    for (const chatId of chatIds) await requireCanSend(me.id, chatId);

    const media = await prisma.waAttachment.findMany({
      where: { messageId: source.id },
      orderBy: { createdAt: "asc" },
      select: {
        key: true,
        filename: true,
        contentType: true,
        size: true,
        width: true,
        height: true,
        durationMs: true,
        waveform: true,
      },
    });

    const forwardScore = Math.max(1, source.forwardScore + 1);

    for (const chatId of chatIds) {
      await prisma.$transaction(async (tx) => {
        const message = await tx.waMessage.create({
          data: {
            chatId,
            senderId: me.id,
            kind: source.kind,
            body: source.body,
            forwardScore,
            replyToId: null,
          },
        });

        if (media.length > 0) {
          // New rows, same `key`: forwarding a 60 MB video must not copy 60 MB.
          // `WaAttachment.key` is deliberately not unique for exactly this, so
          // the copies share one stored object and only the row is duplicated.
          await tx.waAttachment.createMany({
            data: media.map((m) => ({
              ...m,
              purpose: "MESSAGE" as const,
              messageId: message.id,
              chatId,
              uploaderId: me.id,
            })),
          });
        }

        await tx.waChat.update({
          where: { id: chatId },
          data: { lastMessageAt: message.createdAt },
        });

        // Forwarding is sending: it must not come back as unread, and it pulls
        // an archived chat back into the list like any other message.
        await tx.waChatMember.update({
          where: { chatId_userId: { chatId, userId: me.id } },
          data: {
            lastReadAt: message.createdAt,
            lastDeliveredAt: message.createdAt,
            archivedAt: null,
          },
        });
      });

      await broadcastMessage(chatId);
      await markDeliveredToConnected(chatId, me.id);
    }

    return NextResponse.json({ ok: true, count: chatIds.length });
  });
}
