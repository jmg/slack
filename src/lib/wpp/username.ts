/**
 * Public @usernames — the Telegram-style handle that lets someone reach you
 * without knowing your phone number.
 *
 * Dependency-free: the settings form, the search box and the route handler all
 * validate with the same rules, so what the UI accepts and what the API accepts
 * can never disagree.
 *
 * The rules are Telegram's, and each one earns its place:
 * 5-32 characters, letters/digits/underscore, must start with a letter (so a
 * handle is never mistaken for a phone number in a combined search box), must
 * not end with an underscore and must not contain two in a row (both read as
 * typos and make near-identical handles easy to mint for impersonation).
 */

export const USERNAME_MIN = 5;
export const USERNAME_MAX = 32;

/**
 * Handles nobody may take. These read as official, and a `@support` or `@admin`
 * in someone else's hands is a phishing primitive rather than a nickname.
 */
const RESERVED = new Set([
  "admin", "administrator", "root", "support", "help", "helpdesk", "staff",
  "talkaroo", "official", "team", "system", "security", "billing", "payments",
  "me", "you", "all", "everyone", "here", "channel", "group", "chat", "chats",
  "settings", "status", "login", "register", "invite", "api", "www", "app",
  "null", "undefined", "anonymous", "deleted",
]);

/** Lowercase and strip a leading `@`, so "@Ada" and "ada" are one handle. */
export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

export type UsernameProblem =
  | "tooShort"
  | "tooLong"
  | "charset"
  | "start"
  | "end"
  | "doubleUnderscore"
  | "reserved";

/** The first rule the handle breaks, or null when it is usable. */
export function checkUsername(input: string): UsernameProblem | null {
  const value = normalizeUsername(input);
  if (value.length < USERNAME_MIN) return "tooShort";
  if (value.length > USERNAME_MAX) return "tooLong";
  if (!/^[a-z0-9_]+$/.test(value)) return "charset";
  if (!/^[a-z]/.test(value)) return "start";
  if (value.endsWith("_")) return "end";
  if (value.includes("__")) return "doubleUnderscore";
  if (RESERVED.has(value)) return "reserved";
  return null;
}

export function isValidUsername(input: string): boolean {
  return checkUsername(input) === null;
}

/** Does this look like someone reaching for a handle rather than a number? */
export function looksLikeUsername(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.startsWith("@") || /^[a-zA-Z][a-zA-Z0-9_]*$/.test(trimmed);
}
