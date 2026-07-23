import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser } from "@/lib/api";
import { requireChannelAccess } from "@/lib/data";

/**
 * Move this user's read cursor for the channel. Defaults to "now" (mark read);
 * pass `{ at: ISO }` to set it earlier — that's how "mark unread" works.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { channelId } = await params;
    await requireChannelAccess(user.id, channelId);

    const body = await req.json().catch(() => null);
    const at = body && typeof body.at === "string" ? new Date(body.at) : null;
    const lastReadAt = at && !Number.isNaN(at.getTime()) ? at : new Date();

    await prisma.readState.upsert({
      where: { userId_channelId: { userId: user.id, channelId } },
      update: { lastReadAt },
      create: { userId: user.id, channelId, lastReadAt },
    });
    return NextResponse.json({ ok: true });
  });
}
