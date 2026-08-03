"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Archive,
  CircleDashed,
  LogOut,
  MessageCircle,
  Settings,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WaAvatar } from "@/components/wpp/wa-avatar";
import { useMe, useT } from "@/components/wpp/i18n-provider";
import { WPP_API, wpp } from "@/lib/wpp/config";
import { wppError, wppFetch, wppKeys } from "@/lib/wpp/client";
import type { WaChatSummary, WaMe, WaStatusGroup } from "@/lib/wpp/types";
import type { WppKey } from "@/lib/wpp/i18n";

/**
 * The navigation rail: a vertical icon strip on desktop, a bottom tab bar on
 * phones. WhatsApp Web uses the first and WhatsApp mobile the second, and the
 * items are identical, so both render from one list.
 *
 * The unread badge is derived from the chat list SWR cache rather than a
 * dedicated endpoint — the list is already loaded and already revalidated by
 * every relevant realtime signal, so a second request would only add a way for
 * the two numbers to disagree.
 */
type RailItem = {
  href: string;
  icon: typeof MessageCircle;
  key: WppKey;
  badge?: number;
  dot?: boolean;
};

export function WaRail() {
  const t = useT();
  const me = useMe();
  const pathname = usePathname();
  const router = useRouter();

  const { data: chats } = useSWR<{ chats: WaChatSummary[] }>(wppKeys.chats);
  const { data: status } = useSWR<{ groups: WaStatusGroup[] }>(wppKeys.status);
  // `me` from the provider is the server snapshot; SWR carries later edits.
  const { data: liveMe } = useSWR<WaMe>(wppKeys.me, { fallbackData: me });

  const unread =
    chats?.chats.reduce((sum, chat) => sum + (chat.unreadCount > 0 ? 1 : 0), 0) ?? 0;
  const hasNewStatus =
    status?.groups.some((group) => !group.isMe && group.hasUnseen) ?? false;

  const items: RailItem[] = [
    { href: wpp("/chats"), icon: MessageCircle, key: "nav.chats", badge: unread },
    { href: wpp("/status"), icon: CircleDashed, key: "nav.status", dot: hasNewStatus },
    { href: wpp("/starred"), icon: Star, key: "nav.starred" },
    { href: wpp("/archived"), icon: Archive, key: "nav.archived" },
  ];

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function logout() {
    // One stray click on an icon-only button should not end the session.
    if (!window.confirm(t("auth.logoutConfirm", { app: t("app.name") }))) return;
    try {
      await wppFetch(`${WPP_API}/auth/logout`, { method: "POST" });
      router.push(wpp("/login"));
      router.refresh();
    } catch (err) {
      toast.error(wppError(err, t));
    }
  }

  const profile = liveMe ?? me;

  return (
    <>
      {/* Desktop: vertical rail */}
      <nav className="hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-[var(--wa-border)] bg-[var(--wa-header)] py-3 md:flex">
        {items.map((item) => (
          <RailButton key={item.href} item={item} active={isActive(item.href)} t={t} />
        ))}

        <div className="flex-1" />

        <RailButton
          item={{ href: wpp("/settings"), icon: Settings, key: "nav.settings" }}
          active={isActive(wpp("/settings"))}
          t={t}
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => void logout()}
                className="flex size-10 items-center justify-center rounded-full text-[var(--wa-text-dim)] transition-colors hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]"
              />
            }
          >
            <LogOut className="size-5" />
            <span className="sr-only">{t("auth.logout")}</span>
          </TooltipTrigger>
          <TooltipContent side="right">{t("auth.logout")}</TooltipContent>
        </Tooltip>

        <Link
          href={wpp("/settings")}
          aria-label={t("nav.profile")}
          className="mt-1 rounded-full ring-offset-2 ring-offset-[var(--wa-header)] focus-visible:ring-2 focus-visible:ring-[var(--wa-green)]"
        >
          <WaAvatar name={profile.name} avatarUrl={profile.avatarUrl} size={36} />
        </Link>
      </nav>

      {/* Phones: bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-[var(--wa-border)] bg-[var(--wa-header)] py-1.5 md:hidden">
        {[...items, { href: wpp("/settings"), icon: Settings, key: "nav.settings" as WppKey }].map(
          (item) => {
            const active = isActive(item.href);
            const badge = "badge" in item ? item.badge : undefined;
            const dot = "dot" in item ? item.dot : undefined;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex min-w-16 flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[11px]",
                  active
                    ? "text-[var(--wa-green)]"
                    : "text-[var(--wa-text-dim)]",
                )}
              >
                <span className="relative">
                  <item.icon className="size-5" />
                  <Badge count={badge} dot={dot} />
                </span>
                {t(item.key)}
              </Link>
            );
          },
        )}
      </nav>
    </>
  );
}

function RailButton({
  item,
  active,
  t,
}: {
  item: RailItem;
  active: boolean;
  t: ReturnType<typeof useT>;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex size-10 items-center justify-center rounded-full transition-colors",
              active
                ? "bg-[var(--wa-active)] text-[var(--wa-text)]"
                : "text-[var(--wa-text-dim)] hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]",
            )}
          />
        }
      >
        <item.icon className="size-5" />
        <Badge count={item.badge} dot={item.dot} />
        <span className="sr-only">{t(item.key)}</span>
      </TooltipTrigger>
      <TooltipContent side="right">{t(item.key)}</TooltipContent>
    </Tooltip>
  );
}

function Badge({ count, dot }: { count?: number; dot?: boolean }) {
  if (count && count > 0) {
    return (
      <span className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--wa-badge)] px-1 text-[10px] font-semibold text-[var(--wa-badge-ink)]">
        {count > 99 ? "99+" : count}
      </span>
    );
  }
  if (dot) {
    return (
      <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-[var(--wa-badge)]" />
    );
  }
  return null;
}
