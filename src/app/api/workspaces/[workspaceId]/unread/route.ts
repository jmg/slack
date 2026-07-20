import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser } from "@/lib/api";
import { requireWorkspaceMember } from "@/lib/data";
import { mentionHandle } from "@/lib/mentions";

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

    const baseWhere = (after: Date | undefined) => ({
      parentId: null,
      deletedAt: null,
      userId: { not: user.id },
      ...(after ? { createdAt: { gt: after } } : {}),
    });

    async function countFor(where: Record<string, unknown>) {
      const [unread, mentions] = await Promise.all([
        prisma.message.count({ where }),
        prisma.message.count({
          where: { ...where, body: { contains: handleToken, mode: "insensitive" } },
        }),
      ]);
      return { unread, mentions };
    }

    const [channelCounts, conversationCounts] = await Promise.all([
      Promise.all(
        channels.map(async (c) => ({
          id: c.id,
          ...(await countFor({ channelId: c.id, ...baseWhere(channelRead.get(c.id)) })),
        })),
      ),
      Promise.all(
        conversations.map(async (c) => ({
          id: c.id,
          ...(await countFor({
            conversationId: c.id,
            ...baseWhere(conversationRead.get(c.id)),
          })),
        })),
      ),
    ]);

    return NextResponse.json({
      channels: channelCounts,
      conversations: conversationCounts,
    });
  });
}
