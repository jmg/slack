import "server-only";
import { prisma } from "@/lib/prisma";
import { publishToUsers, publishToWorkspace } from "@/lib/events";
import type { WorkspaceEvent } from "@/lib/realtime-types";

/**
 * Server-side broadcast helpers. Route handlers call these after a successful
 * write; each resolves *who* should hear about it (the whole workspace for a
 * public channel, just the members for a private channel or DM) and emits the
 * matching signal.
 *
 * Every helper is wrapped so a broadcast failure can never fail the request that
 * already committed — realtime is best-effort on top of the durable write.
 */

type Audience =
  | { workspaceId: string; scope: "workspace" }
  | { workspaceId: string; scope: "users"; userIds: string[] };

function emit(audience: Audience, event: WorkspaceEvent) {
  if (audience.scope === "workspace") {
    publishToWorkspace(audience.workspaceId, event);
  } else {
    publishToUsers(audience.workspaceId, audience.userIds, event);
  }
}

async function audienceForChannel(channelId: string): Promise<Audience | null> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      workspaceId: true,
      isPrivate: true,
      members: { select: { userId: true } },
    },
  });
  if (!channel) return null;
  return channel.isPrivate
    ? {
        workspaceId: channel.workspaceId,
        scope: "users",
        userIds: channel.members.map((m) => m.userId),
      }
    : { workspaceId: channel.workspaceId, scope: "workspace" };
}

async function audienceForConversation(
  conversationId: string,
): Promise<Audience | null> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { workspaceId: true, members: { select: { userId: true } } },
  });
  if (!conversation) return null;
  return {
    workspaceId: conversation.workspaceId,
    scope: "users",
    userIds: conversation.members.map((m) => m.userId),
  };
}

async function safely(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.error("realtime broadcast failed", err);
  }
}

/**
 * A message was created, edited, deleted or reacted to. Refreshes the timeline
 * it lives in, and — when it's a thread reply — the thread panel too.
 */
export async function broadcastMessage(message: {
  id: string;
  channelId: string | null;
  conversationId: string | null;
  parentId: string | null;
}) {
  await safely(async () => {
    const audience = message.channelId
      ? await audienceForChannel(message.channelId)
      : message.conversationId
        ? await audienceForConversation(message.conversationId)
        : null;
    if (!audience) return;

    emit(audience, {
      kind: "message",
      channelId: message.channelId ?? undefined,
      conversationId: message.conversationId ?? undefined,
    });
    // Refresh the thread this message belongs to. For a reply that's its parent;
    // for a root it's the message itself — a panel showing the root as its
    // header must see edits/deletes/reactions to the root, not just to replies.
    emit(audience, {
      kind: "thread",
      parentId: message.parentId ?? message.id,
      channelId: message.channelId ?? undefined,
      conversationId: message.conversationId ?? undefined,
    });
  });
}

/** A channel was created — make it appear in the right sidebars. */
export async function broadcastChannelCreated(channel: {
  workspaceId: string;
  isPrivate: boolean;
  createdById: string;
}) {
  await safely(async () => {
    if (channel.isPrivate) {
      publishToUsers(channel.workspaceId, [channel.createdById], {
        kind: "channels",
      });
    } else {
      publishToWorkspace(channel.workspaceId, { kind: "channels" });
    }
  });
}

/** A DM conversation was created — surface it for both participants. */
export async function broadcastConversationCreated(
  workspaceId: string,
  userIds: string[],
) {
  await safely(async () => {
    publishToUsers(workspaceId, userIds, { kind: "conversations" });
  });
}

/**
 * A channel's membership changed. Refreshes the members dialog for everyone who
 * can see it, and the channel list (a private channel just became visible, or
 * stopped being visible, to someone).
 */
export async function broadcastChannelMembers(channelId: string) {
  await safely(async () => {
    const audience = await audienceForChannel(channelId);
    if (!audience) return;
    emit(audience, { kind: "channelMembers", channelId });
    emit(audience, { kind: "channels" });
  });
}

/** Workspace membership or presence changed. */
export function broadcastWorkspaceMembers(workspaceId: string) {
  publishToWorkspace(workspaceId, { kind: "members" });
}
