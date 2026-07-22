import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { sendEmail } from "../src/lib/email";

/**
 * Email people about messages they haven't seen. Meant to run on a schedule
 * (deploycloud cron, every few minutes). For each user who opted in and is NOT
 * currently online, it counts messages that are unread (newer than their read
 * cursor, not their own, live + top-level), older than NOTIFY_AFTER_MINUTES, and
 * newer than lastNotifiedAt — then sends one digest and advances the cursor so
 * no message is ever emailed twice.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const AFTER_MIN = Number(process.env.NOTIFY_AFTER_MINUTES ?? "5");
const PRESENCE_WINDOW_MS = 2 * 60 * 1000;
const APP_URL = process.env.APP_BASE_URL ?? "https://slack.deploycloud.app";

function isOnline(lastSeenAt: Date | null): boolean {
  return !!lastSeenAt && Date.now() - lastSeenAt.getTime() < PRESENCE_WINDOW_MS;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

async function main() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - AFTER_MIN * 60_000);

  const users = await prisma.user.findMany({
    where: { emailNotifications: true },
    select: {
      id: true,
      email: true,
      name: true,
      lastSeenAt: true,
      lastNotifiedAt: true,
    },
  });

  let emailed = 0;
  for (const user of users) {
    // "offline OR unread X min": don't email someone actively in the app.
    if (isOnline(user.lastSeenAt)) continue;

    const since = user.lastNotifiedAt ?? new Date(0);

    const [channels, conversations, readStates] = await Promise.all([
      prisma.channel.findMany({
        where: {
          archivedAt: null,
          OR: [
            { isPrivate: false, workspace: { members: { some: { userId: user.id } } } },
            { members: { some: { userId: user.id } } },
          ],
        },
        select: { id: true },
      }),
      prisma.conversation.findMany({
        where: { members: { some: { userId: user.id } } },
        select: { id: true },
      }),
      prisma.readState.findMany({
        where: { userId: user.id },
        select: { channelId: true, conversationId: true, lastReadAt: true },
      }),
    ]);

    const channelRead = new Map<string, Date>();
    const convRead = new Map<string, Date>();
    for (const r of readStates) {
      if (r.channelId) channelRead.set(r.channelId, r.lastReadAt);
      else if (r.conversationId) convRead.set(r.conversationId, r.lastReadAt);
    }

    // Only count messages newer than BOTH the read cursor and the dedupe cursor.
    const lowerBound = (cursor: Date | undefined) =>
      cursor && cursor > since ? cursor : since;

    let unread = 0;
    for (const c of channels) {
      unread += await prisma.message.count({
        where: {
          channelId: c.id,
          parentId: null,
          deletedAt: null,
          userId: { not: user.id },
          createdAt: { gt: lowerBound(channelRead.get(c.id)), lte: cutoff },
        },
      });
    }
    for (const cv of conversations) {
      unread += await prisma.message.count({
        where: {
          conversationId: cv.id,
          parentId: null,
          deletedAt: null,
          userId: { not: user.id },
          createdAt: { gt: lowerBound(convRead.get(cv.id)), lte: cutoff },
        },
      });
    }

    if (unread > 0) {
      const plural = unread === 1 ? "" : "s";
      const ok = await sendEmail({
        to: user.email,
        subject: `You have ${unread} unread message${plural} in Slack`,
        text: `Hi ${user.name},\n\nYou have ${unread} unread message${plural} waiting.\nOpen ${APP_URL} to catch up.\n\n— Slack`,
        html: `<p>Hi ${escapeHtml(user.name)},</p><p>You have <strong>${unread}</strong> unread message${plural} waiting.</p><p><a href="${APP_URL}">Open Slack to catch up →</a></p>`,
      });
      if (ok) emailed += 1;
      console.log(`${user.email}: ${unread} unread (emailed: ${ok})`);
    }

    // Advance the dedupe cursor even at 0 unread, so we never reconsider this window.
    await prisma.user.update({
      where: { id: user.id },
      data: { lastNotifiedAt: cutoff },
    });
  }

  console.log(`notify-emails: ${users.length} opted-in, ${emailed} emailed`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
