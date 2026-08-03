import "server-only";
import { prisma } from "@/lib/prisma";
import { chatMemberIds } from "@/lib/wpp/data";
import { connectedAmong, publishToWaUsers } from "@/lib/wpp/events";
import type { WppEvent } from "@/lib/wpp/realtime-types";

/**
 * Server-side broadcast helpers. Route handlers call these *after* a successful
 * write; each resolves the audience and emits the matching signal.
 *
 * Every helper is wrapped in `safely` so a broadcast failure can never fail the
 * request that already committed — realtime is best-effort on top of the
 * durable write, never a precondition for it.
 */

async function safely(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.error("wpp realtime broadcast failed", err);
  }
}

/** Fan an event out to every current participant of a chat. */
export async function broadcastToChat(chatId: string, event: WppEvent) {
  await safely(async () => {
    publishToWaUsers(await chatMemberIds(chatId), event);
  });
}

/**
 * A message was created, edited, deleted or reacted to.
 *
 * Two signals, because they invalidate different things: the open conversation
 * refetches its timeline, and every participant's chat list refetches its
 * previews, unread badges and ordering.
 */
export async function broadcastMessage(chatId: string) {
  await safely(async () => {
    const userIds = await chatMemberIds(chatId);
    publishToWaUsers(userIds, { kind: "messages", chatId });
    publishToWaUsers(userIds, { kind: "chats" });
  });
}

/** Chat metadata or participants changed — subject, icon, admins, who's in. */
export async function broadcastChatUpdated(chatId: string, extraUserIds: string[] = []) {
  await safely(async () => {
    const userIds = [...(await chatMemberIds(chatId)), ...extraUserIds];
    publishToWaUsers(userIds, { kind: "chat", chatId });
    publishToWaUsers(userIds, { kind: "chats" });
  });
}

/** Read/delivery cursors moved: repaint ticks, no timeline refetch needed. */
export async function broadcastReceipts(chatId: string) {
  await safely(async () => {
    const userIds = await chatMemberIds(chatId);
    publishToWaUsers(userIds, { kind: "receipts", chatId });
    publishToWaUsers(userIds, { kind: "chats" });
  });
}

/** Someone is typing. Never persisted — a keystroke isn't worth a row. */
export async function broadcastTyping(
  chatId: string,
  user: { id: string; name: string },
) {
  await safely(async () => {
    const userIds = (await chatMemberIds(chatId)).filter((id) => id !== user.id);
    publishToWaUsers(userIds, {
      kind: "typing",
      chatId,
      userId: user.id,
      name: user.name,
    });
  });
}

/**
 * Presence changed. Only the people who share a chat with this user care, so
 * that's the audience — a global fan-out would leak who is on the platform.
 */
export async function broadcastPresence(userId: string) {
  await safely(async () => {
    const rows = await prisma.waChatMember.findMany({
      where: {
        leftAt: null,
        chat: { members: { some: { userId, leftAt: null } } },
      },
      select: { userId: true },
      take: 500,
    });
    const audience = rows.map((r) => r.userId).filter((id) => id !== userId);
    publishToWaUsers(audience, { kind: "presence" });
  });
}

export async function broadcastContacts(userIds: string[]) {
  await safely(async () => {
    publishToWaUsers(userIds, { kind: "contacts" });
    publishToWaUsers(userIds, { kind: "chats" });
  });
}

/** A status update was posted, viewed or removed. */
export async function broadcastStatus(userIds: string[]) {
  await safely(async () => {
    publishToWaUsers(userIds, { kind: "status" });
  });
}

/**
 * Advance the delivery cursor for everyone in the chat who currently has an
 * open stream.
 *
 * This is what turns one tick into two the instant a message lands, instead of
 * waiting for the recipient's tab to do something. An open SSE connection is
 * the same "their client has it" evidence a phone's ack gives WhatsApp.
 * Best-effort by design — the cursor also advances whenever a client reads.
 */
export async function markDeliveredToConnected(chatId: string, exceptUserId: string) {
  await safely(async () => {
    const memberIds = (await chatMemberIds(chatId)).filter(
      (id) => id !== exceptUserId,
    );
    const online = connectedAmong(memberIds);
    if (online.length === 0) return;

    await prisma.waChatMember.updateMany({
      where: { chatId, userId: { in: online } },
      data: { lastDeliveredAt: new Date() },
    });
    publishToWaUsers([exceptUserId], { kind: "receipts", chatId });
  });
}
