import { intlLocale, type Translate, type WppLocale } from "@/lib/wpp/i18n";

/**
 * Date, time and preview formatting for the WhatsApp clone.
 *
 * Uses `Intl` rather than date-fns locale bundles: the app only ever needs
 * "time", "weekday" and "short date", all of which `Intl.DateTimeFormat` gives
 * correctly for both locales with nothing shipped to the browser. It also picks
 * the right clock automatically — 24-hour for `es-ES`, 12-hour for `en-US` —
 * which is exactly the difference WhatsApp shows between the two.
 *
 * Formatters are memoised because constructing one is comparatively expensive
 * and a chat list re-renders constantly.
 */

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(
  locale: WppLocale,
  key: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const id = `${locale}:${key}`;
  let f = cache.get(id);
  if (!f) {
    f = new Intl.DateTimeFormat(intlLocale(locale), options);
    cache.set(id, f);
  }
  return f;
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole days between two instants, by calendar day rather than by 24h spans. */
export function daysAgo(date: Date, now = new Date()): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
}

/** "10:42" / "10:42 AM" — the timestamp inside a bubble. */
export function formatTime(iso: string | Date, locale: WppLocale): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return formatter(locale, "time", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/**
 * The right-hand timestamp on a chat-list row: time today, "Yesterday", the
 * weekday within the last week, then a short date. Same ladder as WhatsApp's.
 */
export function formatListTimestamp(
  iso: string,
  locale: WppLocale,
  t: Translate,
): string {
  const date = new Date(iso);
  const days = daysAgo(date);
  if (days <= 0) return formatTime(date, locale);
  if (days === 1) return t("common.yesterday");
  if (days < 7) {
    return formatter(locale, "weekday", { weekday: "short" }).format(date);
  }
  return formatter(locale, "shortDate", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

/** The centred date chip between days of messages. */
export function formatDayDivider(
  iso: string,
  locale: WppLocale,
  t: Translate,
): string {
  const date = new Date(iso);
  const days = daysAgo(date);
  if (days <= 0) return t("common.today");
  if (days === 1) return t("common.yesterday");
  if (days < 7) {
    return formatter(locale, "weekdayLong", { weekday: "long" }).format(date);
  }
  return formatter(locale, "longDate", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Group messages by calendar day so the divider only renders when it changes. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** "online" / "last seen today at 10:42" — the line under the contact's name. */
export function formatPresence(
  presence: { online: boolean; lastSeenAt: string | null },
  locale: WppLocale,
  t: Translate,
): string | null {
  if (presence.online) return t("common.online");
  if (!presence.lastSeenAt) return null;

  const date = new Date(presence.lastSeenAt);
  const time = formatTime(date, locale);
  const days = daysAgo(date);
  if (days <= 0) return t("chat.lastSeenToday", { time });
  if (days === 1) return t("chat.lastSeenYesterday", { time });
  if (days > 365) return t("chat.lastSeenUnknown");
  return t("chat.lastSeenOn", {
    date: formatter(locale, "shortDate", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(date),
    time,
  });
}

/**
 * "3h", "12m" — the age of a status update.
 *
 * Takes `t` rather than branching on the locale: the only word here belongs in
 * the catalogue like every other string, and this module is not a component so
 * it cannot reach `useT()` itself. No `locale` is needed — the unit suffixes are
 * the same single letters in both languages.
 */
export function formatShortAge(iso: string, t: Translate): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t("common.now");
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Deterministic avatar colour, so the same person is always the same hue. */
const AVATAR_COLORS = [
  "#dfa670",
  "#7ea3d1",
  "#c98a8a",
  "#78b98f",
  "#b192cf",
  "#d18fb5",
  "#6fb3b8",
  "#c5a24d",
  "#8f9bd6",
];

export function waAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function waInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "";
  return parts.map((p) => [...p][0]?.toUpperCase() ?? "").join("");
}
