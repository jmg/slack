import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { requireMessageAccess } from "@/lib/wpp/data";
import { publishToWaUsers } from "@/lib/wpp/events";

type Params = { params: Promise<{ messageId: string }> };

/**
 * Toggle a star. Private to the caller — nobody else can tell you starred their
 * message — so this only notifies the caller's own other tabs.
 */
export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { messageId } = await params;
    const message = await requireMessageAccess(me.id, messageId);

    const existing = await prisma.waMessageStar.findUnique({
      where: { messageId_userId: { messageId, userId: me.id } },
      select: { id: true },
    });

    if (existing) {
      await prisma.waMessageStar.delete({ where: { id: existing.id } });
    } else {
      await prisma.waMessageStar.create({ data: { messageId, userId: me.id } });
    }

    publishToWaUsers([me.id], { kind: "messages", chatId: message.chatId });
    return NextResponse.json({ starred: !existing });
  });
}
