import { prisma } from "@/lib/prisma";

export const messageInclude = {
  user: { select: { id: true, name: true, image: true } },
  reactions: { include: { user: { select: { id: true, name: true } } } },
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
  updatedAt: string;
  author: { id: string; name: string; image: string | null };
  reactions: SerializedReaction[];
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

  return {
    id: message.id,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    author: message.user,
    reactions: Array.from(grouped.values()),
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
