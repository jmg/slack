/**
 * The @handle used for a member. The composer inserts this token and the unread
 * counter matches on it, so both sides must agree on the format.
 *
 * We mention the person's *full* display name (e.g. "@Juan Manuel Garcia"),
 * exactly like Slack — never just the first word. A first-name-only handle both
 * looks visually "cut off" at the first space and collides between everyone who
 * shares a first name; the full name is unambiguous and the renderer highlights
 * the whole span (see MessageBody's member-aware mention matching).
 */
export function mentionHandle(name: string): string {
  return `@${name.trim().replace(/\s+/g, " ")}`;
}

/** Tokens that mention a whole channel rather than one person. */
export const BROADCAST_MENTIONS = ["@channel", "@here", "@everyone"];

/** How long since `lastSeenAt` a user still counts as online. */
export const PRESENCE_WINDOW_MS = 2 * 60 * 1000;

export function isOnline(lastSeenAt: Date | string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  const t = typeof lastSeenAt === "string" ? Date.parse(lastSeenAt) : lastSeenAt.getTime();
  return Date.now() - t < PRESENCE_WINDOW_MS;
}
