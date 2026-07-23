import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser } from "@/lib/api";
import { requireConversationMember } from "@/lib/data";

/**
 * Move this user's read cursor for the DM. Defaults to "now" (mark read); pass
 * `{ at: ISO }` to set it earlier — that's how "mark unread" works.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { conversationId } = await params;
    await requireConversationMember(user.id, conversationId);

    const body = await req.json().catch(() => null);
    const at = body && typeof body.at === "string" ? new Date(body.at) : null;
    const lastReadAt = at && !Number.isNaN(at.getTime()) ? at : new Date();

    await prisma.readState.upsert({
      where: { userId_conversationId: { userId: user.id, conversationId } },
      update: { lastReadAt },
      create: { userId: user.id, conversationId, lastReadAt },
    });
    return NextResponse.json({ ok: true });
  });
}
