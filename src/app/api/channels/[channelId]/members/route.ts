import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { requireChannelAccess } from "@/lib/data";
import { isOnline } from "@/lib/mentions";
import { broadcastChannelMembers } from "@/lib/realtime";
import { z } from "zod";

const addMemberSchema = z.object({ userId: z.string().min(1) });

/** Everyone who can see the channel can see who's in it. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { channelId } = await params;
    const channel = await requireChannelAccess(user.id, channelId);

    const members = await prisma.channelMember.findMany({
      where: { channelId },
      orderBy: { user: { name: "asc" } },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            lastSeenAt: true,
          },
        },
      },
    });

    return NextResponse.json({
      isPrivate: channel.isPrivate,
      createdById: channel.createdById,
      members: members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        online: isOnline(m.user.lastSeenAt),
        isMe: m.user.id === user.id,
      })),
    });
  });
}

/**
 * Add someone to the channel. The actor must already have access (so nobody can
 * add themselves to a private channel they can't see) and the target must be a
 * member of the workspace.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { channelId } = await params;
    const channel = await requireChannelAccess(user.id, channelId);

    const json = await req.json().catch(() => null);
    const parsed = addMemberSchema.safeParse(json);
    if (!parsed.success) return apiError("Pick someone to add");

    const target = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: channel.workspaceId,
          userId: parsed.data.userId,
        },
      },
    });
    if (!target) return apiError("That person is not in this workspace", 404);

    await prisma.channelMember.upsert({
      where: {
        channelId_userId: { channelId, userId: parsed.data.userId },
      },
      update: {},
      create: { channelId, userId: parsed.data.userId },
    });

    await broadcastChannelMembers(channelId);

    return NextResponse.json({ ok: true });
  });
}
