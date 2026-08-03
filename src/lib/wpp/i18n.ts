import { en } from "./dictionaries/en";
import { es } from "./dictionaries/es";

/**
 * Bilingual (EN/ES) message catalogue for the WhatsApp clone.
 *
 * Deliberately dependency-free: middleware (Edge), server components, route
 * handlers and client components all import this module, so it must not pull in
 * `server-only`, Prisma, or anything Node-specific.
 *
 * ## Why the locale is not in the URL
 * The Next.js i18n guide routes locales as a `/[lang]` path segment, which is
 * the right call for content sites that need per-language URLs indexed. This is
 * a signed-in messenger: every page is behind auth and nothing is crawlable, so
 * a path segment would only double the route tree. Instead the locale is a
 * *user account setting* (`WaUser.locale`) — exactly where WhatsApp keeps it —
 * with a cookie carrying the choice for logged-out pages.
 *
 * Precedence, highest first: signed-in user's setting → `wpp_locale` cookie →
 * `Accept-Language` → English.
 */

export const WPP_LOCALES = ["en", "es"] as const;
export type WppLocale = (typeof WPP_LOCALES)[number];

/** The key set, derived from the English catalogue (the source of truth). */
export type WppKey = keyof typeof en;
/** Shape every catalogue must satisfy — this is what keeps `es.ts` honest. */
export type WppDict = Record<WppKey, string>;

export const WPP_LOCALE_COOKIE = "wpp_locale";
export const DEFAULT_WPP_LOCALE: WppLocale = "en";

const CATALOGUES: Record<WppLocale, WppDict> = { en, es };

export function isWppLocale(value: unknown): value is WppLocale {
  return (
    typeof value === "string" && (WPP_LOCALES as readonly string[]).includes(value)
  );
}

export function getWppDictionary(locale: WppLocale): WppDict {
  return CATALOGUES[locale] ?? CATALOGUES[DEFAULT_WPP_LOCALE];
}

export type TranslateVars = Record<string, string | number>;

/**
 * Look up `key` and substitute `{placeholders}`. A placeholder with no matching
 * var is left verbatim — visible in the UI, which is what you want when a
 * caller forgets an argument.
 */
export function translate(
  locale: WppLocale,
  key: WppKey,
  vars?: TranslateVars,
): string {
  const template = getWppDictionary(locale)[key] ?? en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export type Translate = (key: WppKey, vars?: TranslateVars) => string;

/** Bind a locale once and hand the result to components as `t`. */
export function createTranslator(locale: WppLocale): Translate {
  return (key, vars) => translate(locale, key, vars);
}

/**
 * Best supported locale for an `Accept-Language` header. Handles the quality
 * values browsers send (`es-AR,es;q=0.9,en;q=0.8`) by sorting on `q` and taking
 * the first entry whose primary subtag we ship.
 */
export function localeFromAcceptLanguage(
  header: string | null | undefined,
): WppLocale | null {
  if (!header) return null;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => /^q=([0-9.]+)$/.exec(p.trim())?.[1])
        .find(Boolean);
      return { tag: (tag ?? "").toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((entry) => entry.tag)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const primary = tag.split("-")[0];
    if (isWppLocale(primary)) return primary;
  }
  return null;
}

/** Apply the precedence documented at the top of this file. */
export function resolveWppLocale(sources: {
  user?: string | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
}): WppLocale {
  if (isWppLocale(sources.user)) return sources.user;
  if (isWppLocale(sources.cookie)) return sources.cookie;
  return (
    localeFromAcceptLanguage(sources.acceptLanguage) ?? DEFAULT_WPP_LOCALE
  );
}

/** `Intl` tag used for date/number formatting in each locale. */
export function intlLocale(locale: WppLocale): string {
  return locale === "es" ? "es-ES" : "en-US";
}
