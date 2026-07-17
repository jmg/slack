import { format, isToday, isYesterday } from "date-fns";

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/** Deterministic avatar background color derived from a string. */
const AVATAR_COLORS = [
  "#e11d48",
  "#db2777",
  "#9333ea",
  "#4f46e5",
  "#0ea5e9",
  "#0d9488",
  "#16a34a",
  "#ca8a04",
  "#ea580c",
];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function formatMessageTime(iso: string): string {
  return format(new Date(iso), "h:mm a");
}

export function formatDayDivider(iso: string): string {
  const date = new Date(iso);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, MMMM d");
}

export function dayKey(iso: string): string {
  return format(new Date(iso), "yyyy-MM-dd");
}
