"use client";

import { useSWRConfig } from "swr";
import { cn } from "@/lib/utils";
import {
  useSetWppLocale,
  useT,
  useWppLocale,
} from "@/components/wpp/i18n-provider";
import { WPP_LOCALES, type WppLocale } from "@/lib/wpp/i18n";
import { setWppLocaleCookie, wppFetch, wppKeys } from "@/lib/wpp/client";

const LABELS: Record<WppLocale, string> = { en: "EN", es: "ES" };

/**
 * EN / ES switch.
 *
 * Always writes the `wpp_locale` cookie — that is what the signed-out pages and
 * the server layout read — and additionally persists to the account when there
 * is one, so the choice follows you to another browser. `router.refresh()` is
 * what makes the switch take effect: the locale is resolved server-side, so the
 * page has to be re-rendered rather than re-styled.
 */
export function WppLangToggle({
  variant = "default",
  persist = false,
  className,
}: {
  variant?: "default" | "onDark";
  /** Save to the signed-in account as well as the cookie. */
  persist?: boolean;
  className?: string;
}) {
  const t = useT();
  const locale = useWppLocale();
  const setLocale = useSetWppLocale();
  const { mutate } = useSWRConfig();

  function choose(next: WppLocale) {
    if (next === locale) return;

    // Repaint first. Both dictionaries are already in the bundle, so this is a
    // pure re-render — waiting on the PATCH and a router.refresh() before a
    // single string changed is what made this feel stuck.
    setLocale(next);
    setWppLocaleCookie(next);

    // The account setting outlives this browser; it just doesn't have to block
    // the switch. A failure leaves the cookie, so the choice survives a reload
    // on this device either way.
    if (persist) {
      void wppFetch(wppKeys.me, { method: "PATCH", json: { locale: next } })
        .then(() => mutate(wppKeys.me))
        .catch(() => {});
    }
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full p-0.5",
        variant === "onDark" ? "bg-white/15" : "bg-[var(--wa-app)]",
        className,
      )}
      role="group"
      aria-label={t("nav.language")}
    >
      {WPP_LOCALES.map((code) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            onClick={() => choose(code)}
            aria-pressed={active}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
              variant === "onDark"
                ? active
                  ? "bg-white text-[var(--wa-green-deep)]"
                  : "text-white/80 hover:text-white"
                : active
                  ? "bg-[var(--wa-green)] text-[var(--wa-green-ink)]"
                  : "text-[var(--wa-text-dim)] hover:text-[var(--wa-text)]",
            )}
          >
            {LABELS[code]}
          </button>
        );
      })}
    </div>
  );
}
