/**
 * The @handle used for a member. The composer inserts this token and the unread
 * counter matches on it, so both sides must agree on the format.
 */
export function mentionHandle(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return `@${first}`;
}

/** How long since `lastSeenAt` a user still counts as online. */
export const PRESENCE_WINDOW_MS = 2 * 60 * 1000;

export function isOnline(lastSeenAt: Date | string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  const t = typeof lastSeenAt === "string" ? Date.parse(lastSeenAt) : lastSeenAt.getTime();
  return Date.now() - t < PRESENCE_WINDOW_MS;
}
