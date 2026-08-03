"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { MessageCircle, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WaAvatar } from "@/components/wpp/wa-avatar";
import { useT } from "@/components/wpp/i18n-provider";
import { WppLangToggle } from "@/components/wpp/wa-lang-toggle";
import { wppError } from "@/lib/wpp/client";
import { WPP_API, wpp } from "@/lib/wpp/config";

type InvitePreview = { name: string; avatarUrl: string | null; memberCount: number };

/**
 * The page a group invite link lands on.
 *
 * Reachable signed out, which shapes everything here: it may not call `useMe()`
 * (there is no `WppMeProvider` outside the `(app)` group), it renders its own
 * card shell instead of borrowing the one from the `(auth)` layout, and joining
 * has to cope with there being no session at all — a 401 sends the visitor to
 * sign in and back, rather than reading as a failure.
 */
export function InviteView({ token }: { token: string }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [joining, setJoining] = useState(false);

  // `wppKeys` has no entry for this one on purpose: it is a one-shot preview
  // that nothing else in the app revalidates.
  const previewUrl = `${WPP_API}/invites/${encodeURIComponent(token)}`;
  const { data, error, isLoading } = useSWR<InvitePreview>(previewUrl);

  async function join() {
    setJoining(true);
    try {
      // Raw fetch rather than `wppFetch`: the status code is the whole point
      // here — "not signed in" needs a redirect, everything else is an error
      // message — and `wppFetch` collapses every failure into a thrown message.
      const res = await fetch(previewUrl, { method: "POST" });

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

      toast.success(t("group.joined", { name: data?.name ?? "" }));
      router.push(wpp(`/chats/${body.id}`));
      // The chat list is server-rendered on that route; refresh so the group is
      // already in it when the navigation settles.
      router.refresh();
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setJoining(false);
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
              <Users className="size-8 text-[var(--wa-text-faint)]" aria-hidden />
              <p className="text-sm font-medium text-[var(--wa-text)]">
                {t("group.inviteInvalid")}
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
              <WaAvatar
                name={data.name}
                avatarUrl={data.avatarUrl}
                group
                size={96}
              />
              <div className="flex flex-col gap-1">
                <h1 className="text-xl font-semibold text-[var(--wa-text)]">
                  {data.name}
                </h1>
                <p className="text-sm text-[var(--wa-text-dim)]">
                  {t("group.participants", { count: data.memberCount })}
                </p>
              </div>

              <p className="text-sm text-[var(--wa-text-dim)]">
                {t("group.joinBody", { name: data.name })}
              </p>

              <Button
                size="lg"
                disabled={joining}
                onClick={() => void join()}
                className="w-full bg-[var(--wa-green-deep)] text-white hover:bg-[var(--wa-green-hover)]"
              >
                {joining ? t("group.joining") : t("group.join")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
