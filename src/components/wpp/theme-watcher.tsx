"use client";

import { useEffect } from "react";
import type { WppTheme } from "@/lib/wpp/config";
import type { WppLocale } from "@/lib/wpp/i18n";

/**
 * Keeps the `.wpp-root` element in step after the initial paint.
 *
 * The inline script in the layout handles the *first* render; this handles the
 * two things that can change afterwards without a full reload: the user flipping
 * their OS to dark mode while the tab is open (only relevant on "system"), and
 * the theme or language being changed in Settings, which re-renders this
 * component with new props rather than reloading the page.
 *
 * Renders nothing.
 */
export function WppThemeWatcher({
  theme,
  locale,
}: {
  theme: WppTheme;
  locale: WppLocale;
}) {
  useEffect(() => {
    const root = document.getElementById("wpp-root");
    if (!root) return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      root.classList.toggle(
        "dark",
        theme === "dark" || (theme === "system" && media.matches),
      );
      root.dataset.theme = theme;
    };

    apply();
    if (theme !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale;
    const root = document.getElementById("wpp-root");
    if (root) root.dataset.locale = locale;
  }, [locale]);

  return null;
}
