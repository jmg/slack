import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser } from "@/lib/api";
import { requireWorkspaceMember } from "@/lib/data";

/** The current user's starred channel + DM ids within this workspace. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { workspaceId } = await params;
    await requireWorkspaceMember(user.id, workspaceId);

    const stars = await prisma.star.findMany({
      where: {
        userId: user.id,
        OR: [{ channel: { workspaceId } }, { conversation: { workspaceId } }],
      },
      select: { channelId: true, conversationId: true },
    });

    return NextResponse.json({
      channelIds: stars.flatMap((s) => (s.channelId ? [s.channelId] : [])),
      conversationIds: stars.flatMap((s) =>
        s.conversationId ? [s.conversationId] : [],
      ),
    });
  });
}
