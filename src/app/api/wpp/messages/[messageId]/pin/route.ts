import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { MAX_PINNED_MESSAGES } from "@/lib/wpp/config";
import { requireCanSend, requireMessageAccess } from "@/lib/wpp/data";
import { writeSystemMessage } from "@/lib/wpp/messages";
import { broadcastChatUpdated, broadcastMessage } from "@/lib/wpp/realtime";

type Params = { params: Promise<{ messageId: string }> };

/**
 * Pin or unpin a message — a toggle, like the star, but shared.
 *
 * That difference is the whole authorization story: a star is private, so
 * `requireMessageAccess` is enough for it, while a pin writes to a bar every
 * participant sees and adds a line to the timeline. Putting something in front
 * of everyone is posting, so it needs the same rights as posting — blocked
 * contacts and members of an admins-only group can't do it.
 */
export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { messageId } = await params;
    const message = await requireMessageAccess(me.id, messageId);

    // Neither has anything left to show in the bar: a tombstone serializes with
    // an empty body, and a system line is chrome rather than content.
    if (message.deletedAt || message.kind === "SYSTEM") {
      throw new ApiError("error.forbidden", 403);
    }
    await requireCanSend(me.id, message.chatId);

    const pinning = message.pinnedAt == null;

    if (pinning) {
      // At the cap WhatsApp rotates rather than refusing: the oldest pin makes
      // way for the new one. Erroring here would push the decision onto someone
      // who can't act on it — they'd have to go and find whichever of three
      // messages, possibly pinned by somebody else, they were allowed to drop.
      //
      // Only rows the pinned bar can actually show are counted, matching
      // `getChatDetail`: a message deleted while pinned is invisible there and
      // must not occupy one of the slots.
      const live = await prisma.waMessage.findMany({
        where: { chatId: message.chatId, pinnedAt: { not: null }, deletedAt: null },
        orderBy: { pinnedAt: "desc" },
        select: { id: true },
      });
      const evicted = live.slice(MAX_PINNED_MESSAGES - 1);
      if (evicted.length > 0) {
        await prisma.waMessage.updateMany({
          where: { id: { in: evicted.map((row) => row.id) } },
          data: { pinnedAt: null, pinnedById: null },
        });
      }
    }

    await prisma.waMessage.update({
      where: { id: messageId },
      data: pinning
        ? { pinnedAt: new Date(), pinnedById: me.id }
        : { pinnedAt: null, pinnedById: null },
    });

    await writeSystemMessage(
      message.chatId,
      pinning ? "message.pinned" : "message.unpinned",
      { actorId: me.id, actorName: me.name },
    );

    // Two signals, because two different things changed: the chat carries the
    // pinned bar, and the bubble carries its own `pinned` flag.
    await broadcastChatUpdated(message.chatId);
    await broadcastMessage(message.chatId);

    return NextResponse.json({ pinned: pinning });
  });
}
