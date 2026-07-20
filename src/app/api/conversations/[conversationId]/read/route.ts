import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser } from "@/lib/api";
import { requireConversationMember } from "@/lib/data";

/** Move this user's read cursor for the DM conversation to "now". */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { conversationId } = await params;
    await requireConversationMember(user.id, conversationId);

    const now = new Date();
    await prisma.readState.upsert({
      where: { userId_conversationId: { userId: user.id, conversationId } },
      update: { lastReadAt: now },
      create: { userId: user.id, conversationId, lastReadAt: now },
    });
    return NextResponse.json({ ok: true });
  });
}
