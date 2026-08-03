import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { requireChatMember } from "@/lib/wpp/data";
import { broadcastReceipts } from "@/lib/wpp/realtime";

type Params = { params: Promise<{ chatId: string }> };

/**
 * Advance the read cursor to now — the client calls this when the chat is open
 * and focused.
 *
 * This is what turns the sender's grey ticks blue, so it also fires a receipts
 * broadcast. Both cursors move: having the chat open is stronger evidence of
 * delivery than an open stream, so a read implies a delivery.
 *
 * Turning read receipts off doesn't stop the cursor moving — it still drives
 * *your* unread badge. What it changes is whether anyone else is allowed to see
 * it (`computeTick` in lib/wpp/messages.ts).
 */
export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { chatId } = await params;
    await requireChatMember(me.id, chatId);

    const now = new Date();
    await prisma.waChatMember.update({
      where: { chatId_userId: { chatId, userId: me.id } },
      data: { lastReadAt: now, lastDeliveredAt: now },
    });

    await broadcastReceipts(chatId);
    return NextResponse.json({ ok: true });
  });
}
