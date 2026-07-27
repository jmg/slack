import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "workspace";
}

/** Ensure a workspace slug is unique by appending a short suffix when needed. */
export async function uniqueWorkspaceSlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let attempt = 0;
  // Try a handful of suffixes before falling back to a random-ish one.
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    attempt += 1;
    slug = `${base}-${attempt}`;
    if (attempt > 50) {
      slug = `${base}-${Date.now().toString(36)}`;
      break;
    }
  }
  return slug;
}

export async function requireWorkspaceMember(userId: string, workspaceId: string) {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspace: true },
  });
  if (!membership) {
    throw new ApiError("Workspace not found", 404);
  }
  return membership;
}

/**
 * A user can access a channel when they belong to the workspace and either the
 * channel is public or they are an explicit member of it.
 */
export async function requireChannelAccess(userId: string, channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { members: { where: { userId } } },
  });
  if (!channel) {
    throw new ApiError("Channel not found", 404);
  }
  await requireWorkspaceMember(userId, channel.workspaceId);
  if (channel.isPrivate && channel.members.length === 0) {
    throw new ApiError("Channel not found", 404);
  }
  return channel;
}

/**
 * Auto-join a new workspace member to the default public channels (general /
 * random), or the oldest public channel if neither exists — so they land with
 * something in their sidebar instead of a bare workspace. Idempotent.
 */
export async function autoJoinDefaultChannels(userId: string, workspaceId: string) {
  let targets = await prisma.channel.findMany({
    where: {
      workspaceId,
      isPrivate: false,
      archivedAt: null,
      OR: [
        { name: { equals: "general", mode: "insensitive" } },
        { name: { equals: "random", mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  if (targets.length === 0) {
    const first = await prisma.channel.findFirst({
      where: { workspaceId, isPrivate: false, archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    targets = first ? [first] : [];
  }
  if (targets.length === 0) return;
  await prisma.channelMember.createMany({
    data: targets.map((c) => ({ channelId: c.id, userId })),
    skipDuplicates: true,
  });
}

/**
 * Posting (messages, thread replies, reactions) requires channel *membership*,
 * not just read access. A public channel is readable by anyone in the workspace,
 * but — like Slack — you must join before you can post in it. Throws 403 when the
 * caller can see the channel but hasn't joined; the client shows a "Join" bar so
 * this is a backstop, not the primary gate.
 */
export async function requireChannelPostAccess(userId: string, channelId: string) {
  const channel = await requireChannelAccess(userId, channelId);
  if (channel.members.length === 0) {
    throw new ApiError("Join this channel to post in it", 403);
  }
  return channel;
}

/**
 * Join a public channel (self-service). Idempotent. Private channels can't be
 * self-joined — you have to be added by a member. Returns the channel.
 */
export async function joinChannel(userId: string, channelId: string) {
  const channel = await requireChannelAccess(userId, channelId);
  if (channel.isPrivate && channel.members.length === 0) {
    // requireChannelAccess already 404s this case, but guard in case it changes.
    throw new ApiError("Channel not found", 404);
  }
  if (channel.members.length === 0) {
    await prisma.channelMember.upsert({
      where: { channelId_userId: { channelId, userId } },
      create: { channelId, userId },
      update: {},
    });
  }
  return channel;
}

/**
 * A user may *manage* a channel (archive, delete, rename) if they created it or
 * are a workspace ADMIN. A channel with no creator can only be managed by an
 * ADMIN. Returns the channel; throws 403 otherwise.
 */
export async function requireChannelManager(userId: string, channelId: string) {
  const channel = await requireChannelAccess(userId, channelId);
  if (channel.createdById === userId) return channel;
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: channel.workspaceId, userId } },
    select: { role: true },
  });
  if (membership?.role !== "ADMIN") {
    throw new ApiError(
      "Only the channel creator or a workspace admin can do that",
      403,
    );
  }
  return channel;
}

export async function requireConversationMember(
  userId: string,
  conversationId: string,
) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { members: { where: { userId } } },
  });
  if (!conversation || conversation.members.length === 0) {
    throw new ApiError("Conversation not found", 404);
  }
  return conversation;
}

/**
 * Ensure the user can see a message (via its channel or conversation) and
 * return it. Used by edit/delete/thread endpoints.
 */
export async function requireMessageAccess(userId: string, messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      userId: true,
      channelId: true,
      conversationId: true,
      parentId: true,
      deletedAt: true,
    },
  });
  if (!message) throw new ApiError("Message not found", 404);
  if (message.channelId) {
    await requireChannelAccess(userId, message.channelId);
  } else if (message.conversationId) {
    await requireConversationMember(userId, message.conversationId);
  } else {
    throw new ApiError("Message not found", 404);
  }
  return message;
}
