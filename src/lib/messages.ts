import { prisma } from "@/lib/prisma";
import { serializeAttachment } from "@/lib/uploads";
import type { SerializedAttachment } from "@/lib/upload-limits";

export const messageInclude = {
  user: { select: { id: true, name: true, image: true } },
  reactions: { include: { user: { select: { id: true, name: true } } } },
  attachments: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      filename: true,
      contentType: true,
      size: true,
      width: true,
      height: true,
    },
  },
  _count: { select: { replies: true } },
  replies: {
    orderBy: { createdAt: "desc" },
    take: 3,
    select: {
      createdAt: true,
      user: { select: { id: true, name: true, image: true } },
    },
  },
} as const;

type MessageWithRelations = Awaited<
  ReturnType<
    typeof prisma.message.findFirstOrThrow<{ include: typeof messageInclude }>
  >
>;

export type SerializedReaction = {
  emoji: string;
  count: number;
  users: string[];
  reactedByMe: boolean;
};

export type SerializedMessage = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  author: { id: string; name: string; image: string | null };
  reactions: SerializedReaction[];
  replyCount: number;
  lastReplyAt: string | null;
  replyUsers: { id: string; name: string; image: string | null }[];
  attachments: SerializedAttachment[];
};

export function serializeMessage(
  message: MessageWithRelations,
  currentUserId: string,
): SerializedMessage {
  const grouped = new Map<string, SerializedReaction>();
  for (const reaction of message.reactions) {
    const existing =
      grouped.get(reaction.emoji) ??
      ({ emoji: reaction.emoji, count: 0, users: [], reactedByMe: false } as SerializedReaction);
    existing.count += 1;
    existing.users.push(reaction.user.name);
    if (reaction.user.id === currentUserId) existing.reactedByMe = true;
    grouped.set(reaction.emoji, existing);
  }

  // Distinct recent repliers (for the thread avatar stack).
  const replyUsers: SerializedMessage["replyUsers"] = [];
  const seen = new Set<string>();
  for (const reply of message.replies) {
    if (seen.has(reply.user.id)) continue;
    seen.add(reply.user.id);
    replyUsers.push(reply.user);
  }

  const deleted = message.deletedAt != null;

  return {
    id: message.id,
    body: deleted ? "" : message.body,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt ? message.editedAt.toISOString() : null,
    deleted,
    author: message.user,
    reactions: deleted ? [] : Array.from(grouped.values()),
    replyCount: message._count.replies,
    lastReplyAt: message.replies[0]?.createdAt.toISOString() ?? null,
    replyUsers,
    attachments: deleted ? [] : message.attachments.map(serializeAttachment),
  };
}

export async function listChannelMessages(channelId: string, currentUserId: string) {
  const messages = await prisma.message.findMany({
    where: { channelId, parentId: null },
    include: messageInclude,
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return messages.map((m) => serializeMessage(m, currentUserId));
}

export async function listConversationMessages(
  conversationId: string,
  currentUserId: string,
) {
  const messages = await prisma.message.findMany({
    where: { conversationId, parentId: null },
    include: messageInclude,
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return messages.map((m) => serializeMessage(m, currentUserId));
}

/** Replies within a thread, oldest first — but always the most recent 500. */
export async function listThreadReplies(parentId: string, currentUserId: string) {
  const replies = await prisma.message.findMany({
    where: { parentId },
    include: messageInclude,
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return replies.reverse().map((m) => serializeMessage(m, currentUserId));
}
