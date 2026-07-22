import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser } from "@/lib/api";
import { requireWorkspaceMember } from "@/lib/data";
import { BROADCAST_MENTIONS, mentionHandle } from "@/lib/mentions";

/**
 * Unread + mention counts per channel and DM for the current user. A message is
 * unread when it was posted after the user's read cursor, isn't their own, and
 * is a live top-level message (matching what the timeline renders).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { workspaceId } = await params;
    await requireWorkspaceMember(user.id, workspaceId);

    const [channels, conversations, readStates] = await Promise.all([
      prisma.channel.findMany({
        where: {
          workspaceId,
          OR: [{ isPrivate: false }, { members: { some: { userId: user.id } } }],
        },
        select: { id: true },
      }),
      prisma.conversation.findMany({
        where: { workspaceId, members: { some: { userId: user.id } } },
        select: { id: true },
      }),
      prisma.readState.findMany({
        where: { userId: user.id },
        select: { channelId: true, conversationId: true, lastReadAt: true },
      }),
    ]);

    const channelRead = new Map<string, Date>();
    const conversationRead = new Map<string, Date>();
    for (const r of readStates) {
      if (r.channelId) channelRead.set(r.channelId, r.lastReadAt);
      else if (r.conversationId) conversationRead.set(r.conversationId, r.lastReadAt);
    }

    const handleToken = mentionHandle(user.name);

    const contains = (t: string) =>
      ({ body: { contains: t, mode: "insensitive" as const } });

    async function countFor(
      target: { channelId: string } | { conversationId: string },
      after: Date | undefined,
      broadcast: boolean,
    ) {
      const base = {
        ...target,
        deletedAt: null,
        userId: { not: user.id },
        ...(after ? { createdAt: { gt: after } } : {}),
      };
      // In a channel, @channel/@here/@everyone mention every member; in a DM only
      // the personal handle counts.
      const mentionMatch = broadcast
        ? { OR: [contains(handleToken), ...BROADCAST_MENTIONS.map(contains)] }
        : contains(handleToken);
      const [unread, mentions] = await Promise.all([
        // Unread badge = live top-level messages, matching what the timeline shows.
        prisma.message.count({ where: { ...base, parentId: null } }),
        // Mentions also count thread replies: an @mention inside a thread must
        // still badge the person even though it's not a top-level message.
        prisma.message.count({ where: { ...base, ...mentionMatch } }),
      ]);
      return { unread, mentions };
    }

    const [channelCounts, conversationCounts] = await Promise.all([
      Promise.all(
        channels.map(async (c) => ({
          id: c.id,
          ...(await countFor({ channelId: c.id }, channelRead.get(c.id), true)),
        })),
      ),
      Promise.all(
        conversations.map(async (c) => ({
          id: c.id,
          ...(await countFor({ conversationId: c.id }, conversationRead.get(c.id), false)),
        })),
      ),
    ]);

    return NextResponse.json({
      channels: channelCounts,
      conversations: conversationCounts,
    });
  });
}
