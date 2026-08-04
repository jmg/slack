"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { MessageCircle, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WaAvatar } from "@/components/wpp/wa-avatar";
import { useT } from "@/components/wpp/i18n-provider";
import { WppLangToggle } from "@/components/wpp/wa-lang-toggle";
import { wppError } from "@/lib/wpp/client";
import { WPP_API, wpp } from "@/lib/wpp/config";
import { normalizeUsername } from "@/lib/wpp/username";

type PublicProfile = {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  about: string | null;
};

/**
 * The page an `@handle` link lands on.
 *
 * Reachable signed out, which shapes everything here — the same constraints the
 * invite page works under: it may not call `useMe()` (there is no
 * `WppMeProvider` outside the `(app)` group), it brings its own card shell, and
 * starting the chat has to cope with there being no session, which is a
 * redirect to sign in rather than an error.
 *
 * Only what the owner published is on show. There is no phone number anywhere
 * on this page on purpose: being reachable without handing out a number is the
 * entire reason a handle exists.
 */
export function PublicProfileView({ username }: { username: string }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [opening, setOpening] = useState(false);

  // Normalized before it is sent so "/u/@Ada" and "/u/ada" hit one cache entry
  // rather than two, and so a pasted "@" in the URL still resolves.
  const handle = normalizeUsername(username);
  // No `wppKeys` entry: a one-shot lookup nothing else in the app revalidates.
  const profileUrl = `${WPP_API}/users/${encodeURIComponent(handle)}`;
  const { data, error, isLoading } = useSWR<PublicProfile>(
    handle ? profileUrl : null,
  );

  async function openChat() {
    setOpening(true);
    try {
      // Raw fetch rather than `wppFetch`: the status code is the whole point
      // here — "not signed in" needs a redirect, everything else is an error
      // message — and `wppFetch` collapses every failure into a thrown message.
      const res = await fetch(profileUrl, { method: "POST" });

      if (res.status === 401) {
        router.push(`${wpp("/login")}?next=${encodeURIComponent(pathname)}`);
        return;
      }

      const body = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };
      if (!res.ok || !body.id) {
        throw new Error(body.error ?? "common.somethingWrong");
      }

      router.push(wpp(`/chats/${body.id}`));
      // The chat list is server-rendered on that route; refresh so a chat that
      // was created by this very request is already in it on arrival.
      router.refresh();
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="relative flex flex-1 flex-col bg-[var(--wa-app)]">
      <div className="absolute inset-x-0 top-0 h-56 bg-[var(--wa-green-deep)]" />

      <div className="relative flex flex-1 flex-col items-center px-4 py-10">
        <div className="mb-6 flex w-full max-w-md items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <MessageCircle className="size-6" aria-hidden />
            <span className="text-sm font-semibold tracking-wide uppercase">
              {t("app.name")}
            </span>
          </div>
          <WppLangToggle variant="onDark" />
        </div>

        <div className="w-full max-w-md rounded-lg bg-[var(--wa-panel)] p-6 shadow-lg sm:p-8">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-[var(--wa-text-dim)]">
              {t("common.loading")}
            </p>
          ) : error || !data ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <UserX className="size-8 text-[var(--wa-text-faint)]" aria-hidden />
              <p className="text-sm font-medium text-[var(--wa-text)]">
                {t("error.userNotFound")}
              </p>
              <Button
                variant="ghost"
                onClick={() => router.push(wpp())}
                className="mt-2"
              >
                {t("common.goToChats")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-center">
              <WaAvatar name={data.name} avatarUrl={data.avatarUrl} size={96} />
              <div className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold text-[var(--wa-text)]">
                  {data.name || t("common.unknownContact")}
                </h1>
                {data.username && (
                  <p className="text-sm text-[var(--wa-text-dim)]">
                    @{data.username}
                  </p>
                )}
              </div>

              {data.about && (
                <p className="wa-text text-sm text-[var(--wa-text-dim)]">
                  {data.about}
                </p>
              )}

              <Button
                size="lg"
                disabled={opening}
                onClick={() => void openChat()}
                className="w-full bg-[var(--wa-green-deep)] text-white hover:bg-[var(--wa-green-hover)]"
              >
                {t("group.messageParticipant")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
