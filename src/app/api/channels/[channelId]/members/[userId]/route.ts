import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { requireChannelAccess } from "@/lib/data";

/**
 * Remove someone from a channel — or leave it yourself.
 *
 * You may always remove yourself. Removing *someone else* is limited to the
 * channel's creator and workspace admins. A private channel may not be left
 * empty, or it would become invisible to everyone including admins.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ channelId: string; userId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { channelId, userId } = await params;
    const channel = await requireChannelAccess(user.id, channelId);

    const isSelf = userId === user.id;
    if (!isSelf) {
      const membership = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: channel.workspaceId,
            userId: user.id,
          },
        },
        select: { role: true },
      });
      const isAdmin = membership?.role === "ADMIN";
      const isCreator = channel.createdById === user.id;
      if (!isAdmin && !isCreator) {
        return apiError(
          "Only the channel creator or a workspace admin can remove people",
          403,
        );
      }
    }

    const existing = await prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    if (!existing) return apiError("They're not in this channel", 404);

    if (channel.isPrivate) {
      const remaining = await prisma.channelMember.count({ where: { channelId } });
      if (remaining <= 1) {
        return apiError(
          "A private channel can't be left empty — delete it instead",
          400,
        );
      }
    }

    await prisma.channelMember.delete({
      where: { channelId_userId: { channelId, userId } },
    });

    return NextResponse.json({ ok: true });
  });
}
