import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requireWaUser } from "@/lib/wpp/api";
import { advanceDeliveryCursors } from "@/lib/wpp/data";
import { broadcastPresence, broadcastReceipts } from "@/lib/wpp/realtime";
import { isWaOnline } from "@/lib/wpp/config";

/**
 * Client heartbeat: refresh `lastSeenAt` so contacts see "online" instead of a
 * stale "last seen".
 *
 * A live client is also evidence of delivery, so the caller's delivery cursors
 * move with it — a phone that is awake has received the messages waiting for
 * it, which is exactly when WhatsApp paints the sender's second tick.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();

    // The client beats every PRESENCE_HEARTBEAT_MS (25s); the ceiling only has
    // to leave room for a handful of open tabs.
    const limited = rateLimit(`wpp:presence:${me.id}:${clientIp(req)}`, 30, 60 * 1000);
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "error.rateLimited" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
      );
    }

    // A routine beat from someone already shown as online changes nothing
    // anyone can see. Only a genuine offline→online transition is worth a
    // fan-out — otherwise every tab's 25s ping would trigger a refetch in every
    // chat partner's client, which is O(N²) and defeats the point of the bus.
    const cameOnline = !isWaOnline(me.lastSeenAt);

    await prisma.waUser.update({
      where: { id: me.id },
      data: { lastSeenAt: new Date() },
    });

    // Only the chats that had something undelivered need their ticks repainted.
    for (const chatId of await advanceDeliveryCursors(me.id)) {
      await broadcastReceipts(chatId);
    }
    if (cameOnline) await broadcastPresence(me.id);

    return NextResponse.json({ ok: true });
  });
}
