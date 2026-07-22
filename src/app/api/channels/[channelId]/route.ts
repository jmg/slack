import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { requireChannelManager } from "@/lib/data";
import {
  broadcastChannelRemoved,
  broadcastChannelUpdated,
} from "@/lib/realtime";

const patchSchema = z
  .object({
    archived: z.boolean().optional(),
    name: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes only")
      .optional(),
    description: z.string().trim().max(280).nullish(),
  })
  .refine(
    (d) =>
      d.archived !== undefined ||
      d.name !== undefined ||
      d.description !== undefined,
    { message: "Nothing to update" },
  );

/** Archive/unarchive, rename, or set the topic. Creator or workspace ADMIN only. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { channelId } = await params;
    const channel = await requireChannelManager(user.id, channelId);

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { archived, name, description } = parsed.data;

    // Names are unique per workspace.
    if (name && name !== channel.name) {
      const clash = await prisma.channel.findUnique({
        where: { workspaceId_name: { workspaceId: channel.workspaceId, name } },
        select: { id: true },
      });
      if (clash) return apiError("A channel with that name already exists", 409);
    }

    await prisma.channel.update({
      where: { id: channelId },
      data: {
        ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}),
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
      },
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
