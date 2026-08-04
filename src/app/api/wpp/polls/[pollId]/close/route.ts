import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { requireMessageAccess } from "@/lib/wpp/data";
import { broadcastMessage } from "@/lib/wpp/realtime";

type Params = { params: Promise<{ pollId: string }> };

/**
 * Stop the poll. Votes freeze but stay visible, exactly as WhatsApp does.
 *
 * Idempotent: the author may well tap "Stop poll" on two devices, and closing an
 * already-closed poll a second time would otherwise move `closedAt` forward for
 * no reason.
 */
export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { pollId } = await params;

    const poll = await prisma.waPoll.findUnique({
      where: { id: pollId },
      select: { messageId: true, closedAt: true },
    });
    if (!poll) throw new ApiError("error.notFound", 404);

    const message = await requireMessageAccess(me.id, poll.messageId);
    // Only the author decides when voting is over — being an admin of the group
    // doesn't extend to somebody else's poll.
    if (message.senderId !== me.id) throw new ApiError("error.forbidden", 403);

    if (!poll.closedAt) {
      await prisma.waPoll.update({
        where: { id: pollId },
        data: { closedAt: new Date() },
      });
      await broadcastMessage(message.chatId);
    }

    return NextResponse.json({ ok: true });
  });
}
