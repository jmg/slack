import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { BROADCAST_MENTIONS, isOnline, mentionHandle } from "@/lib/mentions";

// Web Push (VAPID). Lazily configured so `next build` / a deploy without VAPID
// keys works fine — push just no-ops until the keys are set.
let vapidReady = false;
function getWebPush(): typeof webpush | null {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null;
  if (!vapidReady) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
    vapidReady = true;
  }
  return webpush;
}

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function vapidPublicKey(): string | undefined {
  return process.env.VAPID_PUBLIC_KEY;
}

export type PushPayload = { title: string; body: string; url: string };

/** Deliver a push to every subscription a user has, pruning dead ones. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const wp = getWebPush();
  if (!wp) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await wp.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        );
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // 404/410 = the subscription is gone; drop it so we stop trying.
        if (code === 404 || code === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        } else {
          console.error("push: send failed", code, (err as Error).message);
        }
      }
    }),
  );
}

/**
 * Fire push notifications for a freshly-created message: @mentions (and
 * @channel/@here/@everyone broadcasts) in channels, and every recipient of a DM.
 * Skips the author and anyone currently active in the app. Fire-and-forget.
 */
export async function sendPushForMessage(messageId: string): Promise<void> {
  if (!pushConfigured()) return;
  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      body: true,
      deletedAt: true,
      userId: true,
      channelId: true,
      conversationId: true,
      user: { select: { name: true } },
    },
  });
  if (!msg || msg.deletedAt || !msg.body) return;

  const authorName = msg.user.name;
  const snippet = msg.body.replace(/\s+/g, " ").trim().slice(0, 140);

  let recipients: { userId: string; lastSeenAt: Date | null }[] = [];
  let title = "";
  let url = "";
  let body = snippet;

  if (msg.channelId) {
    const channel = await prisma.channel.findUnique({
      where: { id: msg.channelId },
      select: { name: true, workspaceId: true },
    });
    if (!channel) return;
    const members = await prisma.channelMember.findMany({
      where: { channelId: msg.channelId },
      select: { userId: true, user: { select: { name: true, lastSeenAt: true } } },
    });
    const lower = msg.body.toLowerCase();
    const broadcast = BROADCAST_MENTIONS.some((t) => lower.includes(t));
    recipients = members
      .filter((m) => m.userId !== msg.userId)
      .filter((m) => broadcast || lower.includes(mentionHandle(m.user.name).toLowerCase()))
      .map((m) => ({ userId: m.userId, lastSeenAt: m.user.lastSeenAt }));
    title = `#${channel.name}`;
    body = `${authorName}: ${snippet}`;
    url = `/w/${channel.workspaceId}/c/${msg.channelId}?msg=${msg.id}`;
  } else if (msg.conversationId) {
    const conv = await prisma.conversation.findUnique({
      where: { id: msg.conversationId },
      select: { workspaceId: true },
    });
    if (!conv) return;
    const members = await prisma.conversationMember.findMany({
      where: { conversationId: msg.conversationId },
      select: { userId: true, user: { select: { lastSeenAt: true } } },
    });
    recipients = members
      .filter((m) => m.userId !== msg.userId)
      .map((m) => ({ userId: m.userId, lastSeenAt: m.user.lastSeenAt }));
    title = authorName;
    url = `/w/${conv.workspaceId}/d/${msg.conversationId}?msg=${msg.id}`;
  } else {
    return;
  }

  // Don't push people who are actively using the app right now.
  recipients = recipients.filter((r) => !isOnline(r.lastSeenAt));
  if (recipients.length === 0) return;

  await Promise.all(recipients.map((r) => sendPushToUser(r.userId, { title, body, url })));
}
