import { cookies, headers } from "next/headers";
import { MessageCircle } from "lucide-react";
import { WppLangToggle } from "@/components/wpp/wa-lang-toggle";
import { getCurrentWaUser } from "@/lib/wpp/auth";
import { WPP_LOCALE_COOKIE, resolveWppLocale, translate } from "@/lib/wpp/i18n";

/**
 * The signed-out shell: sign in, sign up.
 *
 * WhatsApp's own web onboarding is a card on a green band, so this leans the
 * same way. The language toggle sits here rather than in Settings because
 * someone who hasn't signed in yet has no account setting to read.
 *
 * A server component, so the wordmark is translated by resolving the locale the
 * same way `../layout.tsx` does rather than through `useT()` — the alternative
 * was a client component for one word.
 */
export default async function WppAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, cookieStore, headerList] = await Promise.all([
    getCurrentWaUser(),
    cookies(),
    headers(),
  ]);

  const locale = resolveWppLocale({
    user: user?.locale,
    cookie: cookieStore.get(WPP_LOCALE_COOKIE)?.value,
    acceptLanguage: headerList.get("accept-language"),
  });

  return (
    <div className="relative flex flex-1 flex-col bg-[var(--wa-app)]">
      {/* The band behind the card, like the WhatsApp Web landing screen. */}
      <div className="absolute inset-x-0 top-0 h-56 bg-[var(--wa-green-deep)]" />

      <div className="relative flex flex-1 flex-col items-center px-4 py-10">
        <div className="mb-6 flex w-full max-w-md items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <MessageCircle className="size-6" />
            <span className="text-sm font-semibold tracking-wide uppercase">
              {translate(locale, "app.name")}
            </span>
          </div>
          <WppLangToggle variant="onDark" />
        </div>

        <div className="w-full max-w-md rounded-lg bg-[var(--wa-panel)] p-6 shadow-lg sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
