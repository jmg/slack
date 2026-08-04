"use client";

import { createContext, useContext, useMemo, useState } from "react";
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
type LocaleValue = {
  locale: WppLocale;
  t: Translate;
  /** Switch language *now*, without waiting for the server. */
  setLocale: (locale: WppLocale) => void;
};

const LocaleContext = createContext<LocaleValue | null>(null);
const MeContext = createContext<WaMe | null>(null);

/**
 * The locale is resolved server-side, but held in state here so switching it is
 * instant.
 *
 * Both dictionaries are already in the client bundle, so changing language is a
 * pure re-render — nothing has to be fetched. Driving it from the server prop
 * alone meant every flip cost a PATCH *and* a full `router.refresh()` round
 * trip before a single string changed, which is what made the EN/ES toggle feel
 * like it had stalled.
 *
 * The server prop still wins whenever it changes (a navigation, a refresh),
 * adopted during render rather than in an effect so no frame is painted with
 * the stale language.
 */
export function WppLocaleProvider({
  locale: serverLocale,
  children,
}: {
  locale: WppLocale;
  children: React.ReactNode;
}) {
  const [locale, setLocale] = useState(serverLocale);
  const [lastFromServer, setLastFromServer] = useState(serverLocale);

  if (serverLocale !== lastFromServer) {
    setLastFromServer(serverLocale);
    setLocale(serverLocale);
  }

  const value = useMemo<LocaleValue>(
    () => ({ locale, t: createTranslator(locale), setLocale }),
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

/** Apply a language change immediately. No-op outside a provider. */
export function useSetWppLocale(): (locale: WppLocale) => void {
  const ctx = useContext(LocaleContext);
  return ctx?.setLocale ?? (() => {});
}

/** The signed-in account. Only valid inside the authenticated `/wpp` tree. */
export function useMe(): WaMe {
  const me = useContext(MeContext);
  if (!me) {
    throw new Error("useMe must be used inside <WppMeProvider>");
  }
  return me;
}
