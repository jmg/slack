import { cache } from "react";
import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { getCurrentWaUser } from "@/lib/wpp/auth";
import { WPP_LOCALE_COOKIE, resolveWppLocale, translate } from "@/lib/wpp/i18n";
import { DEFAULT_WALLPAPER, WPP_BASE_PATH, isWppTheme } from "@/lib/wpp/config";
import { WppLocaleProvider } from "@/components/wpp/i18n-provider";
import { WppThemeWatcher } from "@/components/wpp/theme-watcher";

/**
 * Account, locale and the two presentation settings, resolved once per request.
 * `cache` is what keeps `generateMetadata` and the layout body — two separate
 * calls in the same render — from each paying for the session lookup, and what
 * guarantees they agree on the locale.
 */
const wppShell = cache(async () => {
  const [user, cookieStore, headerList] = await Promise.all([
    getCurrentWaUser(),
    cookies(),
    headers(),
  ]);

  return {
    locale: resolveWppLocale({
      user: user?.locale,
      cookie: cookieStore.get(WPP_LOCALE_COOKIE)?.value,
      acceptLanguage: headerList.get("accept-language"),
    }),
    theme: user && isWppTheme(user.theme) ? user.theme : "system",
    wallpaper: user?.wallpaper ?? DEFAULT_WALLPAPER,
  };
});

/**
 * Generated rather than static: the title and description are catalogue entries
 * like every other string, so they can only be produced once the request's
 * locale is known.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await wppShell();
  return {
    title: translate(locale, "app.name"),
    description: translate(locale, "app.description"),
    // Overrides the root layout's manifest, which describes the Slack half.
    manifest: `${WPP_BASE_PATH}/manifest.webmanifest`,
    // iOS ignores the manifest entirely: "Add to Home Screen" reads these.
    appleWebApp: {
      capable: true,
      title: translate(locale, "app.name"),
      statusBarStyle: "black-translucent",
    },
    icons: {
      icon: [{ url: "/wpp/icon-192.png", sizes: "192x192", type: "image/png" }],
      apple: [{ url: "/wpp/apple-touch-icon.png", sizes: "180x180" }],
    },
  };
}

/**
 * Deepest layout wins, so this replaces the Slack half's purple chrome for
 * every `/wpp` route — the colour behind the status bar in a standalone window.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#00a884" },
    { media: "(prefers-color-scheme: dark)", color: "#111b21" },
  ],
  viewportFit: "cover",
};

/**
 * Root of the WhatsApp clone.
 *
 * Everything below lives inside one `.wpp-root` element, which is what scopes
 * the WhatsApp palette (see the `.wpp-root` block in globals.css) so the Slack
 * half in the same app keeps its own theme. Wrapping in a div rather than a
 * second root layout keeps `src/app/layout.tsx` — and every Slack route under
 * it — completely untouched.
 *
 * Three things are resolved server-side so the first paint is already right:
 * the language, the theme, and the chat wallpaper.
 */
export default async function WppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { locale, theme, wallpaper } = await wppShell();

  return (
    <div
      id="wpp-root"
      // The pre-paint script below adds `dark` here, so the server HTML and the
      // first client render can legitimately disagree on className.
      suppressHydrationWarning
      className={`wpp-root flex min-h-dvh flex-1 flex-col ${
        theme === "dark" ? "dark" : ""
      }`}
      data-theme={theme}
      data-locale={locale}
      data-wallpaper={wallpaper}
    >
      {/*
        Resolve "system" and fix <html lang> before the browser paints.
        Doing it in an effect instead would flash the light theme on every load
        for anyone whose OS is dark — the one thing a messenger you stare at all
        day must not do.
      */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var r=document.getElementById("wpp-root");if(!r)return;var t=r.dataset.theme;var dark=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);r.classList.toggle("dark",dark);document.documentElement.lang=r.dataset.locale||"en";}catch(e){}})();`,
        }}
      />
      <WppLocaleProvider locale={locale}>
        <WppThemeWatcher theme={theme} locale={locale} />
        {children}
      </WppLocaleProvider>
    </div>
  );
}
