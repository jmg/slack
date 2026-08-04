"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import {
  Archive,
  AtSign,
  BellOff,
  MessageSquarePlus,
  Pin,
  Search,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WaAvatar } from "@/components/wpp/wa-avatar";
import { WaTicks } from "@/components/wpp/wa-ticks";
import { useMe, useT, useWppLocale } from "@/components/wpp/i18n-provider";
import { useTypingIn } from "@/components/wpp/realtime-provider";
import { ChatRowMenu } from "@/components/wpp/chat-row-menu";
import { NewChatDialog } from "@/components/wpp/new-chat-dialog";
import { NotificationPrompt } from "@/components/wpp/notification-prompt";
import { wppError, wppFetch, wppKeys } from "@/lib/wpp/client";
import { wpp } from "@/lib/wpp/config";
import { formatListTimestamp } from "@/lib/wpp/format";
import { chatPreviewParts, previewToString } from "@/lib/wpp/preview";
import type { WaChatSummary, WaSearchHit } from "@/lib/wpp/types";

type Filter = "all" | "unread" | "groups";

/**
 * The middle column: search, filters and the ordered list of chats.
 *
 * Ordering, unread counts and previews all arrive pre-resolved from
 * `/api/wpp/chats` (see `listChatSummaries`) — the client sorts nothing, because
 * "pinned first, then recency" has to match what the server computed or the list
 * would jump on every revalidation.
 */
export function ChatListPanel({
  variant = "chats",
}: {
  variant?: "chats" | "archived";
}) {
  const t = useT();
  const me = useMe();
  const router = useRouter();
  const params = useParams<{ chatId?: string }>();
  const { mutate } = useSWRConfig();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [newChatOpen, setNewChatOpen] = useState(false);

  const isArchivedView = variant === "archived";
  const listKey = isArchivedView ? wppKeys.archived : wppKeys.chats;

  const { data, isLoading } = useSWR<{ chats: WaChatSummary[] }>(listKey);
  // The archived count is shown on the chats view, so that list is needed there
  // too — SWR dedupes it against whatever the archived screen already fetched.
  const { data: archivedData } = useSWR<{ chats: WaChatSummary[] }>(
    isArchivedView ? null : wppKeys.archived,
  );

  // Searching in WhatsApp spans chats *and* message bodies. Chat names are
  // filtered locally (the list is already in memory); message bodies need the
  // server, so that request only fires once the query is worth a round trip.
  const trimmedQuery = query.trim();
  const { data: searchData } = useSWR<{ hits: WaSearchHit[] }>(
    trimmedQuery.length >= 2 ? wppKeys.search(trimmedQuery) : null,
    { keepPreviousData: true },
  );

  const chats = useMemo(() => data?.chats ?? [], [data]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return chats.filter((chat) => {
      if (filter === "unread" && chat.unreadCount === 0) return false;
      if (filter === "groups" && chat.type !== "GROUP") return false;
      if (!q) return true;
      const parts = chatPreviewParts(chat.lastMessage, {
        t,
        meId: me.id,
        isGroup: chat.type === "GROUP",
      });
      return (
        chat.name.toLowerCase().includes(q) ||
        (chat.peer?.phone ?? "").toLowerCase().includes(q) ||
        (parts?.text ?? "").toLowerCase().includes(q)
      );
    });
  }, [chats, filter, query, t, me.id]);

  // Searching the archived shelf would surface chats the user deliberately put
  // away, so message hits only appear on the main list.
  const messageHits = isArchivedView ? [] : (searchData?.hits ?? []);

  async function startChat(userId: string) {
    try {
      const chat = await wppFetch<{ id: string }>(wppKeys.chats, {
        method: "POST",
        json: { userId },
      });
      void mutate(wppKeys.chats);
      setNewChatOpen(false);
      router.push(wpp(`/chats/${chat.id}`));
    } catch (err) {
      toast.error(wppError(err, t));
    }
  }

  return (
    <div
      className={cn(
        "flex w-full shrink-0 flex-col border-r border-[var(--wa-border)] bg-[var(--wa-panel)] md:w-[30rem] md:max-w-[40%]",
        // On a phone the list and the conversation are one screen each, so the
        // list steps aside as soon as a chat is open.
        params?.chatId && "hidden md:flex",
      )}
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
        <h1 className="text-xl font-semibold text-[var(--wa-text)]">
          {t(isArchivedView ? "archived.title" : "chats.title")}
        </h1>
        {!isArchivedView && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => setNewChatOpen(true)}
                  className="flex size-9 items-center justify-center rounded-full text-[var(--wa-text-dim)] transition-colors hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]"
                />
              }
            >
              <MessageSquarePlus className="size-5" />
              <span className="sr-only">{t("nav.newChat")}</span>
            </TooltipTrigger>
            <TooltipContent>{t("nav.newChat")}</TooltipContent>
          </Tooltip>
        )}
      </header>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--wa-text-dim)]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("chats.searchPlaceholder")}
            aria-label={t("common.search")}
            className="h-9 rounded-lg border-transparent bg-[var(--wa-app)] pr-8 pl-9 text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("common.close")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-[var(--wa-text-dim)] hover:text-[var(--wa-text)]"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {!isArchivedView && (
        <div className="flex gap-2 px-3 pb-2">
          {(["all", "unread", "groups"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={cn(
                "rounded-full px-3 py-1 text-sm transition-colors",
                filter === key
                  ? "bg-[color-mix(in_srgb,var(--wa-green)_22%,transparent)] text-[var(--wa-green)]"
                  : "bg-[var(--wa-app)] text-[var(--wa-text-dim)] hover:text-[var(--wa-text)]",
              )}
            >
              {t(`chats.${key}` as const)}
            </button>
          ))}
        </div>
      )}

      {!isArchivedView && <NotificationPrompt />}

      <div className="wa-scroll flex-1 overflow-y-auto">
        {!isArchivedView && (archivedData?.chats.length ?? 0) > 0 && (
          <Link
            href={wpp("/archived")}
            className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--wa-hover)]"
          >
            <span className="flex size-12 items-center justify-center text-[var(--wa-green)]">
              <Archive className="size-5" />
            </span>
            <span className="text-sm font-medium text-[var(--wa-text)]">
              {t("chats.archivedCount", {
                count: archivedData?.chats.length ?? 0,
              })}
            </span>
          </Link>
        )}

        {isLoading && chats.length === 0 ? (
          <ChatListSkeleton />
        ) : visible.length === 0 && messageHits.length === 0 ? (
          <EmptyState
            query={query}
            isArchivedView={isArchivedView}
            hasChats={chats.length > 0}
          />
        ) : (
          <>
            {visible.length > 0 && (
              <ul>
                {visible.map((chat) => (
                  <ChatRow
                    key={chat.id}
                    chat={chat}
                    active={params?.chatId === chat.id}
                    listKey={listKey}
                  />
                ))}
              </ul>
            )}

            {messageHits.length > 0 && (
              <>
                <p className="px-4 pt-4 pb-1 text-xs font-medium tracking-wide text-[var(--wa-green)] uppercase">
                  {t("chats.messagesSection")}
                </p>
                <ul>
                  {messageHits.map((hit) => (
                    <MessageHitRow key={hit.message.id} hit={hit} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      <NewChatDialog
        open={newChatOpen}
        onOpenChange={setNewChatOpen}
        onPick={startChat}
      />
    </div>
  );
}

function ChatRow({
  chat,
  active,
  listKey,
}: {
  chat: WaChatSummary;
  active: boolean;
  listKey: string;
}) {
  const t = useT();
  const me = useMe();
  const locale = useWppLocale();
  const typing = useTypingIn(chat.id);

  const parts = chatPreviewParts(chat.lastMessage, {
    t,
    meId: me.id,
    isGroup: chat.type === "GROUP",
  });

  const isTyping = typing.length > 0;
  const unread = chat.unreadCount;

  return (
    <li className="group/row relative">
      <Link
        href={wpp(`/chats/${chat.id}`)}
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 transition-colors",
          active ? "bg-[var(--wa-selected)]" : "hover:bg-[var(--wa-hover)]",
        )}
      >
        <WaAvatar
          name={chat.name}
          avatarUrl={chat.avatarUrl}
          group={chat.type === "GROUP"}
          size={48}
        />

        <span className="flex min-w-0 flex-1 flex-col gap-0.5 border-b border-[var(--wa-border)] pb-2.5 -mb-2.5 group-last/row:border-transparent">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[15px] text-[var(--wa-text)]">
              {chat.isSelfChat
                ? `${chat.name} (${t("common.you")})`
                : chat.name || t("common.deletedAccount")}
            </span>
            <span
              className={cn(
                "shrink-0 text-[11px]",
                unread > 0 ? "text-[var(--wa-green)]" : "text-[var(--wa-text-dim)]",
              )}
            >
              {formatListTimestamp(chat.lastActivityAt, locale, t)}
            </span>
          </span>

          <span className="flex items-center gap-1.5">
            <span className="flex min-w-0 flex-1 items-center gap-1 text-sm text-[var(--wa-text-dim)]">
              {isTyping ? (
                <span className="truncate text-[var(--wa-green)]">
                  {chat.type === "GROUP"
                    ? t("chat.typingBy", { name: typing[0].name })
                    : t("chat.typing")}
                </span>
              ) : chat.draft ? (
                <>
                  <span className="shrink-0 text-[var(--destructive)]">
                    {t("chats.draft")}
                  </span>
                  <span className="truncate">{chat.draft}</span>
                </>
              ) : parts ? (
                <>
                  {parts.showTick && chat.type !== "GROUP" && (
                    <WaTicks tick={chat.lastMessage?.tick ?? null} className="shrink-0" />
                  )}
                  {parts.prefix && <span className="shrink-0">{parts.prefix}</span>}
                  {parts.mediaLabel && (
                    <span className="shrink-0">{parts.mediaLabel}</span>
                  )}
                  <span className="truncate">{parts.text}</span>
                </>
              ) : null}
            </span>

            <span className="flex shrink-0 items-center gap-1.5">
              {chat.mutedUntil && (
                <BellOff className="size-3.5 text-[var(--wa-text-dim)]" />
              )}
              {chat.pinned && <Pin className="size-3.5 text-[var(--wa-text-dim)]" />}
              {chat.mentionCount > 0 && (
                <AtSign
                  aria-label={t("chat.mentionsYou")}
                  className="size-3.5 text-[var(--wa-green)]"
                />
              )}
              {unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--wa-badge)] px-1.5 text-[11px] font-semibold text-[var(--wa-badge-ink)]">
                  {unread > 999 ? "999+" : unread}
                </span>
              )}
            </span>
          </span>
        </span>
      </Link>

      {/* Row actions appear on hover, like the chevron in WhatsApp Web. */}
      <ChatRowMenu chat={chat} listKey={listKey} />
    </li>
  );
}

/**
 * A message that matched the search, shown under the chat rows.
 *
 * Links to the chat with `?msg=` so the conversation can scroll to and flash
 * the hit — the same deep-link convention the Slack half uses.
 */
function MessageHitRow({ hit }: { hit: WaSearchHit }) {
  const t = useT();
  const me = useMe();
  const locale = useWppLocale();

  const parts = chatPreviewParts(hit.message, {
    t,
    meId: me.id,
    isGroup: hit.chatType === "GROUP",
  });

  return (
    <li>
      <Link
        href={`${wpp(`/chats/${hit.chatId}`)}?msg=${hit.message.id}`}
        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--wa-hover)]"
      >
        <WaAvatar
          name={hit.chatName}
          avatarUrl={hit.chatAvatarUrl}
          group={hit.chatType === "GROUP"}
          size={40}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-sm text-[var(--wa-text)]">
              {hit.chatName}
            </span>
            <span className="shrink-0 text-[11px] text-[var(--wa-text-dim)]">
              {formatListTimestamp(hit.message.createdAt, locale, t)}
            </span>
          </span>
          <span className="truncate text-sm text-[var(--wa-text-dim)]">
            {previewToString(parts)}
          </span>
        </span>
      </Link>
    </li>
  );
}

function ChatListSkeleton() {
  return (
    <ul className="animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <span className="size-12 shrink-0 rounded-full bg-[var(--wa-hover)]" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-3 w-1/3 rounded bg-[var(--wa-hover)]" />
            <span className="h-3 w-2/3 rounded bg-[var(--wa-hover)]" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({
  query,
  isArchivedView,
  hasChats,
}: {
  query: string;
  isArchivedView: boolean;
  hasChats: boolean;
}) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
      <Users className="size-8 text-[var(--wa-text-faint)]" />
      <p className="text-sm font-medium text-[var(--wa-text)]">
        {query.trim()
          ? t("chats.noResults", { query: query.trim() })
          : isArchivedView
            ? t("archived.empty")
            : t("chats.empty")}
      </p>
      {!query.trim() && !isArchivedView && !hasChats && (
        <p className="text-sm text-[var(--wa-text-dim)]">{t("chats.emptyHint")}</p>
      )}
    </div>
  );
}
