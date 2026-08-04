"use client";

import { createContext, useContext, useMemo } from "react";
import {
  createTranslator,
  DEFAULT_WPP_LOCALE,
  type Translate,
  type WppLocale,
} from "@/lib/wpp/i18n";
import type { WaMe } from "@/lib/wpp/types";

/**
 * Two contexts rather than one, because the signed-out screens need exactly half
 * of it: the login, register and invite pages must render in the visitor's
 * language (detected from `Accept-Language`) while having no account at all.
 * Folding `me` into the same provider would force those pages to fake one.
 *
 * The `me` snapshot comes from the server layout at page load; anything that
 * *edits* the profile reads through SWR (`wppKeys.me`) so it sees its own writes.
 */
const LocaleContext = createContext<{ locale: WppLocale; t: Translate } | null>(
  null,
);
const MeContext = createContext<WaMe | null>(null);

export function WppLocaleProvider({
  locale,
  children,
}: {
  locale: WppLocale;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ locale, t: createTranslator(locale) }),
    [locale],
  );
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function WppMeProvider({
  me,
  children,
}: {
  me: WaMe;
  children: React.ReactNode;
}) {
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

/**
 * Falls back to English when rendered outside a provider instead of throwing:
 * a screen in the wrong language is recoverable, a screen that crashes is not.
 */
export function useT(): Translate {
  const ctx = useContext(LocaleContext);
  return ctx?.t ?? createTranslator(DEFAULT_WPP_LOCALE);
}

export function useWppLocale(): WppLocale {
  return useContext(LocaleContext)?.locale ?? DEFAULT_WPP_LOCALE;
}

/** The signed-in account. Only valid inside the authenticated `/wpp` tree. */
export function useMe(): WaMe {
  const me = useContext(MeContext);
  if (!me) {
    throw new Error("useMe must be used inside <WppMeProvider>");
  }
  return me;
}
