/**
 * Constants for the WhatsApp clone, shared by client and server.
 * Dependency-free on purpose — imported from Edge proxy, route handlers and
 * client bundles alike.
 */

/**
 * Every page of the WhatsApp clone lives under this prefix, on every host.
 * `wpp.talkaroo.app/…` is folded into it by the proxy (src/proxy.ts), so links
 * only ever need one form and dev on `localhost:3000/wpp` behaves identically
 * to production on the subdomain.
 */
export const WPP_BASE_PATH = "/wpp";

/** Build a path inside the WhatsApp app: `wpp("/chats")` → `/wpp/chats`. */
export function wpp(path = ""): string {
  return path ? `${WPP_BASE_PATH}${path}` : WPP_BASE_PATH;
}

/** API namespace. Never rewritten by the proxy — always absolute. */
export const WPP_API = "/api/wpp";

/** How long after sending a message it can still be edited (WhatsApp: 15 min). */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

/** How long "delete for everyone" stays available (WhatsApp: 2 days 12 h). */
export const DELETE_FOR_EVERYONE_WINDOW_MS = (2 * 24 + 12) * 60 * 60 * 1000;

/** Heartbeat freshness that still counts as "online". */
export const PRESENCE_WINDOW_MS = 45 * 1000;
/** How often the client sends its presence heartbeat. */
export const PRESENCE_HEARTBEAT_MS = 25 * 1000;

/** Is this heartbeat recent enough to render as "online"? */
export function isWaOnline(lastSeenAt: Date | string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  const t =
    typeof lastSeenAt === "string" ? Date.parse(lastSeenAt) : lastSeenAt.getTime();
  return Number.isFinite(t) && Date.now() - t < PRESENCE_WINDOW_MS;
}

/** A typing signal is shown for this long, then it lapses on its own. */
export const TYPING_TTL_MS = 6 * 1000;
/** Don't re-POST "typing" more often than this while someone keeps typing. */
export const TYPING_THROTTLE_MS = 3 * 1000;

/** Status updates live 24 hours, like the real thing. */
export const STATUS_TTL_MS = 24 * 60 * 60 * 1000;

/** Messages fetched per chat. */
export const MESSAGE_PAGE_SIZE = 60;

/** `forwardScore` at or above this renders as "Forwarded many times". */
export const FORWARD_MANY_THRESHOLD = 4;

/**
 * Disappearing-message presets, in seconds. Same three WhatsApp offers — the
 * timer is deliberately not free-form, so "how long do these last" has one of a
 * few well-known answers rather than an arbitrary number nobody can predict.
 */
export const DISAPPEARING_PRESETS = [86_400, 604_800, 7_776_000] as const;
export type DisappearingSeconds = (typeof DISAPPEARING_PRESETS)[number];

export function isDisappearingPreset(value: number): value is DisappearingSeconds {
  return (DISAPPEARING_PRESETS as readonly number[]).includes(value);
}

/** Poll shape limits, matching WhatsApp's. */
export const MAX_POLL_OPTIONS = 12;
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_QUESTION = 255;
export const MAX_POLL_OPTION = 100;

/** How many messages may be pinned in one chat at a time. */
export const MAX_PINNED_MESSAGES = 3;

/** Max messages selectable at once in the multi-select bar. */
export const MAX_SELECTED_MESSAGES = 100;

/** Max participants in a group. */
export const MAX_GROUP_MEMBERS = 256;

/** "Mute always" is stored as a concrete far-future instant, not null. */
export const MUTE_FOREVER_MS = 100 * 365 * 24 * 60 * 60 * 1000;

/** Chat wallpapers (CSS background applied behind the message list). */
export const WPP_WALLPAPERS = {
  default: { light: "#efeae2", dark: "#0b141a" },
  plain: { light: "#f7f5f3", dark: "#111b21" },
  sage: { light: "#e4ebe4", dark: "#0d1a14" },
  sand: { light: "#f2e9dd", dark: "#1a140d" },
  slate: { light: "#e6ecef", dark: "#0e1519" },
  rose: { light: "#f6e7e7", dark: "#1c1113" },
} as const;

export type WallpaperKey = keyof typeof WPP_WALLPAPERS;
export const DEFAULT_WALLPAPER: WallpaperKey = "default";

export function isWallpaper(key: string): key is WallpaperKey {
  return key in WPP_WALLPAPERS;
}

/** Background palette offered for a text status, matching WhatsApp's. */
export const STATUS_BACKGROUNDS = [
  "#25d366",
  "#128c7e",
  "#075e54",
  "#34b7f1",
  "#7f66ff",
  "#ff5c8a",
  "#f4a742",
  "#e5493b",
  "#2f3b43",
] as const;

/** The reaction bar that pops up on a message, in WhatsApp's order. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

export type WppTheme = "light" | "dark" | "system";
export const WPP_THEMES: WppTheme[] = ["light", "dark", "system"];
export function isWppTheme(value: string): value is WppTheme {
  return (WPP_THEMES as string[]).includes(value);
}
