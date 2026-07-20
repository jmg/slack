import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser } from "@/lib/api";
import { requireChannelAccess } from "@/lib/data";

/** Move this user's read cursor for the channel to "now". */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { channelId } = await params;
    await requireChannelAccess(user.id, channelId);

    const now = new Date();
    await prisma.readState.upsert({
      where: { userId_channelId: { userId: user.id, channelId } },
      update: { lastReadAt: now },
      create: { userId: user.id, channelId, lastReadAt: now },
    });
    return NextResponse.json({ ok: true });
  });
}
