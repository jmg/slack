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
