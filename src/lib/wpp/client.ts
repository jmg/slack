"use client";

import { WPP_API, DELETE_FOR_EVERYONE_WINDOW_MS, EDIT_WINDOW_MS } from "@/lib/wpp/config";
import { en } from "@/lib/wpp/dictionaries/en";
import { WPP_LOCALE_COOKIE, type Translate, type WppKey } from "@/lib/wpp/i18n";

/**
 * Browser-side helpers for talking to `/api/wpp/**`.
 *
 * ## Errors come back as dictionary keys
 * The API can't know which language the caller reads, so every user-facing
 * failure carries a `WppKey` as its message (see `lib/wpp/validators.ts`).
 * `wppError` runs it back through `t()` and falls back to the raw string, so an
 * unexpected message still surfaces instead of vanishing.
 */

function isWppKey(value: string): value is WppKey {
  return Object.prototype.hasOwnProperty.call(en, value);
}

/**
 * Turn a thrown error into a sentence in the reader's language.
 *
 * The window constants are always supplied: the two keys that need them
 * ("editable for 15 minutes") are thrown by the server, which has no way to
 * interpolate them into a key. Extra vars are ignored by `t()`, so passing them
 * unconditionally is free.
 */
export function wppError(err: unknown, t: Translate): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (!raw) return t("common.somethingWrong");
  return isWppKey(raw)
    ? t(raw, {
        minutes: Math.round(EDIT_WINDOW_MS / 60_000),
        hours: Math.round(DELETE_FOR_EVERYONE_WINDOW_MS / 3_600_000),
      })
    : raw;
}

/**
 * Remember the chosen language for the signed-out pages.
 *
 * Lives here rather than inline in the toggle because `document.cookie` is a
 * write to a module-external value, which the React Compiler lint rules
 * (rightly) refuse inside a component body.
 */
export function setWppLocaleCookie(locale: string): void {
  document.cookie = `${WPP_LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** JSON request against the WhatsApp API. Throws with the server's key. */
export async function wppFetch<T = unknown>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path.startsWith("/") ? path : `${WPP_API}/${path}`, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...rest.headers,
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "common.somethingWrong");
  }
  // 204 and friends have no body to parse.
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/**
 * SWR keys, in one place.
 *
 * The realtime hook revalidates by exactly these strings, so a typo here would
 * silently break live updates rather than fail loudly — which is why nothing
 * builds these URLs inline.
 */
export const wppKeys = {
  me: `${WPP_API}/me`,
  chats: `${WPP_API}/chats`,
  archived: `${WPP_API}/chats?archived=1`,
  chat: (chatId: string) => `${WPP_API}/chats/${chatId}`,
  messages: (chatId: string) => `${WPP_API}/chats/${chatId}/messages`,
  contacts: `${WPP_API}/contacts`,
  blocks: `${WPP_API}/blocks`,
  starred: `${WPP_API}/starred`,
  status: `${WPP_API}/status`,
  search: (q: string) => `${WPP_API}/search?q=${encodeURIComponent(q)}`,
} as const;
