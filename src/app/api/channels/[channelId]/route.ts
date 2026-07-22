import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { requireChannelManager } from "@/lib/data";
import {
  broadcastChannelRemoved,
  broadcastChannelUpdated,
} from "@/lib/realtime";

const patchSchema = z.object({ archived: z.boolean() });

/** Archive / unarchive a channel. Creator or workspace ADMIN only. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { channelId } = await params;
    await requireChannelManager(user.id, channelId);

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("Invalid input");

    await prisma.channel.update({
      where: { id: channelId },
      data: { archivedAt: parsed.data.archived ? new Date() : null },
    });
    await broadcastChannelUpdated(channelId);
    return NextResponse.json({ ok: true });
  });
}

/** Permanently delete a channel and its messages. Creator or workspace ADMIN. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { channelId } = await params;
    const channel = await requireChannelManager(user.id, channelId);

    // Capture the audience before the row (and its members) are gone.
    const members = await prisma.channelMember.findMany({
      where: { channelId },
      select: { userId: true },
    });

    // All Channel back-relations cascade (messages, members, read state), so
    // this removes the whole channel and its history in one go.
    await prisma.channel.delete({ where: { id: channelId } });

    broadcastChannelRemoved({
      workspaceId: channel.workspaceId,
      isPrivate: channel.isPrivate,
      memberIds: members.map((m) => m.userId),
    });
    return NextResponse.json({ ok: true });
  });
}
