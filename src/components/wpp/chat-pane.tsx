"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import {
  ArrowLeft,
  ChevronDown,
  Eraser,
  Info,
  LogOut,
  MoreVertical,
  Star,
  Timer,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WaAvatar } from "@/components/wpp/wa-avatar";
import { MessageBubble } from "@/components/wpp/message-bubble";
import { Composer } from "@/components/wpp/composer";
import { ForwardDialog } from "@/components/wpp/forward-dialog";
import { GroupInfoPanel } from "@/components/wpp/group-info-panel";
import { PinnedBar } from "@/components/wpp/pinned-bar";
import { DisappearingDialog } from "@/components/wpp/disappearing-dialog";
import { useMe, useT, useWppLocale } from "@/components/wpp/i18n-provider";
import { useTypingIn } from "@/components/wpp/realtime-provider";
import { wppError, wppFetch, wppKeys } from "@/lib/wpp/client";
import { MAX_SELECTED_MESSAGES, WPP_API, wpp } from "@/lib/wpp/config";
import { dayKey, formatDayDivider, formatPresence } from "@/lib/wpp/format";
import type { WaChatDetail, WaMessage } from "@/lib/wpp/types";

/** How long two messages from the same person stay in one visual run. */
const GROUPING_WINDOW_MS = 5 * 60 * 1000;

/**
 * The conversation.
 *
 * Owns three pieces of state the pieces below it don't: what is being replied to
 * or edited, the optimistic bubbles for messages whose POST is still in flight,
 * and the scroll position. Everything else is server truth via SWR, revalidated
 * by the realtime signals in `WppRealtimeProvider`.
 */
export function ChatPane({ chatId }: { chatId: string }) {
  const t = useT();
  const me = useMe();
  const locale = useWppLocale();
  const router = useRouter();
  const { mutate } = useSWRConfig();

  const { data: chat, error } = useSWR<WaChatDetail>(wppKeys.chat(chatId));
  const { data: page } = useSWR<{ messages: WaMessage[]; hasMore: boolean }>(
    wppKeys.messages(chatId),
  );

  const [replyTo, setReplyTo] = useState<WaMessage | null>(null);
  const [editing, setEditing] = useState<WaMessage | null>(null);
  const [forwarding, setForwarding] = useState<WaMessage | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [pending, setPending] = useState<WaMessage[]>([]);
  const [atBottom, setAtBottom] = useState(true);
  /** Multi-select. Empty means the mode is off — there is no separate flag to
   *  keep in step with it. */
  const [selected, setSelected] = useState<string[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  // Monotonic so two identical messages sent in a row get distinct React keys.
  const nextPendingId = useRef(0);
  const typing = useTypingIn(chatId);

  const messages = useMemo(() => page?.messages ?? [], [page]);
  const visible = useMemo(() => [...messages, ...pending], [messages, pending]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  // Follow new messages only when the reader is already at the bottom —
  // yanking someone out of the history they're scrolled into is the fastest way
  // to make a chat app feel broken.
  useEffect(() => {
    if (atBottom) scrollToBottom();
  }, [visible.length, atBottom, scrollToBottom]);

  // The pane is keyed by chat id upstream, so opening another conversation
  // remounts it: no state to reset here, only the initial jump to the newest
  // message once the first page has painted.
  useEffect(() => {
    const frame = requestAnimationFrame(() => scrollToBottom());
    return () => cancelAnimationFrame(frame);
  }, [scrollToBottom]);

  /**
   * Advance the read cursor. Fires when the chat opens, when new messages land
   * while it is visible, and when the tab regains focus — the three moments a
   * human has actually seen the screen.
   */
  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") return;
    void wppFetch(`${WPP_API}/chats/${chatId}/read`, { method: "POST" })
      .then(() => mutate(wppKeys.chats))
      .catch(() => {});
  }, [chatId, mutate]);

  useEffect(() => {
    markRead();
    const onVisible = () => markRead();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [markRead, messages.length]);

  function toggleSelect(messageId: string) {
    setSelected((current) =>
      current.includes(messageId)
        ? current.filter((id) => id !== messageId)
        : current.length >= MAX_SELECTED_MESSAGES
          ? current
          : [...current, messageId],
    );
  }

  /** Run one action over the whole selection, then leave select mode. */
  async function bulk(action: "star" | "delete") {
    if (selected.length === 0) return;
    if (
      action === "delete" &&
      !window.confirm(t("select.deleteConfirm", { count: selected.length }))
    ) {
      return;
    }
    try {
      // Sequential rather than parallel: these are ordinary per-message
      // endpoints, and firing 100 of them at once would trip the send limiter.
      for (const id of selected) {
        if (action === "star") {
          await wppFetch(`${WPP_API}/messages/${id}/star`, { method: "POST" });
        } else {
          await wppFetch(`${WPP_API}/messages/${id}`, {
            method: "DELETE",
            json: { scope: "me" },
          });
        }
      }
      setSelected([]);
      void mutate(wppKeys.messages(chatId));
      void mutate(wppKeys.chats);
      void mutate(wppKeys.starred);
    } catch (err) {
      toast.error(wppError(err, t));
    }
  }

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
  }

  const jumpTo = useCallback((messageId: string) => {
    const target = document.getElementById(`wa-msg-${messageId}`);
    if (!target) return false;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlighted(messageId);
    setTimeout(() => setHighlighted(null), 2000);
    return true;
  }, []);

  /**
   * Deep link from search: `?msg=<id>` scrolls to and flashes that message.
   *
   * Read from `window.location` rather than `useSearchParams` on purpose —
   * the hook forces a Suspense boundary on every route that renders this pane,
   * and the target only exists after the timeline has painted anyway.
   */
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("msg");
    if (!target || messages.length === 0) return;
    const frame = requestAnimationFrame(() => {
      if (jumpTo(target)) {
        // Consume the parameter so a later revalidation doesn't yank the reader
        // back to it, and so reloading the page doesn't re-trigger the jump.
        router.replace(wpp(`/chats/${chatId}`), { scroll: false });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [chatId, messages.length, jumpTo, router]);

  /**
   * Show a message before the server has confirmed it.
   *
   * Returns the remover rather than clearing itself from an effect: the
   * composer knows exactly when the real copy has landed in the SWR cache, and
   * removing on that signal is what keeps the bubble from blinking.
   */
  function addOptimistic({ body, hasAttachments }: { body: string; hasAttachments: boolean }) {
    // Media messages skip the optimistic bubble: we'd have nothing to draw
    // until the upload resolves, and an empty placeholder is worse than a
    // half-second wait.
    if (hasAttachments || !body) return () => {};
    const id = `pending-${nextPendingId.current++}`;
    setPending((current) => [
      ...current,
      {
        id,
        chatId,
        kind: "TEXT",
        body,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deleted: false,
        mine: true,
        sender: { id: me.id, name: me.name, phone: null, avatarUrl: me.avatarUrl },
        system: null,
        replyTo: null,
        forwardScore: 0,
        attachments: [],
        reactions: [],
        starred: false,
        tick: null,
        poll: null,
        pinned: false,
        // The server stamps the real expiry from the chat's timer; an optimistic
        // bubble only lives until the send returns, so it never needs one.
        expiresAt: null,
        mentionsMe: false,
        mentionTokens: [],
      },
    ]);
    setAtBottom(true);
    return () => setPending((current) => current.filter((p) => p.id !== id));
  }

  async function chatAction(action: "clear" | "delete" | "leave") {
    try {
      if (action === "clear") {
        if (!window.confirm(t("chatMenu.clearConfirm"))) return;
        await wppFetch(`${wppKeys.chat(chatId)}/state`, {
          method: "PATCH",
          json: { clear: true },
        });
        void mutate(wppKeys.messages(chatId));
      } else if (action === "leave") {
        if (!window.confirm(t("group.exitConfirm", { name: chat?.name ?? "" }))) return;
        await wppFetch(`${WPP_API}/chats/${chatId}/leave`, { method: "POST" });
        void mutate(wppKeys.chat(chatId));
      } else {
        if (!window.confirm(t("chatMenu.deleteConfirm"))) return;
        await wppFetch(wppKeys.chat(chatId), { method: "DELETE" });
        router.push(wpp("/chats"));
      }
      void mutate(wppKeys.chats);
    } catch (err) {
      toast.error(wppError(err, t));
    }
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--wa-text-dim)]">
        {t("error.chatNotFound")}
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--wa-text-dim)]">
        {t("common.loading")}
      </div>
    );
  }

  const isGroup = chat.type === "GROUP";
  const subtitle = typing.length
    ? isGroup
      ? typing.length > 1
        ? t("chat.typingSeveral")
        : t("chat.typingBy", { name: typing[0].name })
      : t("chat.typing")
    : isGroup
      ? chat.members.map((m) => (m.isMe ? t("common.you") : m.name)).join(", ")
      : chat.peer
        ? formatPresence(chat.peer, locale, t)
        : null;

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="wa-wallpaper flex min-h-0 min-w-0 flex-1 flex-col">
        {selected.length > 0 ? (
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--wa-border)] bg-[var(--wa-header)] px-3">
            <button
              type="button"
              onClick={() => setSelected([])}
              aria-label={t("select.clear")}
              className="rounded-full p-2 text-[var(--wa-text-dim)] hover:bg-[var(--wa-hover)]"
            >
              <X className="size-5" />
            </button>
            <span className="flex-1 text-sm font-medium text-[var(--wa-text)]">
              {t("select.title", { count: selected.length })}
            </span>
            <button
              type="button"
              onClick={() => void bulk("star")}
              aria-label={t("message.star")}
              className="rounded-full p-2 text-[var(--wa-text-dim)] hover:bg-[var(--wa-hover)]"
            >
              <Star className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => void bulk("delete")}
              aria-label={t("message.deleteForMe")}
              className="rounded-full p-2 text-[var(--destructive)] hover:bg-[var(--wa-hover)]"
            >
              <Trash2 className="size-5" />
            </button>
          </header>
        ) : (
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--wa-border)] bg-[var(--wa-header)] px-3">
          <Link
            href={wpp("/chats")}
            aria-label={t("common.back")}
            className="-ml-1 rounded-full p-1.5 text-[var(--wa-text-dim)] hover:bg-[var(--wa-hover)] md:hidden"
          >
            <ArrowLeft className="size-5" />
          </Link>

          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <WaAvatar
              name={chat.name}
              avatarUrl={chat.avatarUrl}
              group={isGroup}
              size={40}
            />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] font-medium text-[var(--wa-text)]">
                {chat.isSelfChat
                  ? `${chat.name} (${t("common.you")})`
                  : chat.name || t("common.deletedAccount")}
              </span>
              <span
                className={cn(
                  "truncate text-xs",
                  typing.length
                    ? "text-[var(--wa-green)]"
                    : "text-[var(--wa-text-dim)]",
                )}
              >
                {subtitle ?? t(isGroup ? "chat.tapForGroupInfo" : "chat.tapForContactInfo")}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setInfoOpen(true)}
            aria-label={t(isGroup ? "chatMenu.groupInfo" : "chatMenu.contactInfo")}
            className="rounded-full p-2 text-[var(--wa-text-dim)] hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]"
          >
            <Info className="size-5" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={t("common.options")}
                  className="rounded-full p-2 text-[var(--wa-text-dim)] hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]"
                />
              }
            >
              <MoreVertical className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setInfoOpen(true)}>
                <Info />
                {t(isGroup ? "chatMenu.groupInfo" : "chatMenu.contactInfo")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTimerOpen(true)}>
                <Timer />
                {t("disappearing.title")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void chatAction("clear")}>
                <Eraser />
                {t("chatMenu.clearMessages")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {isGroup && chat.isMember && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => void chatAction("leave")}
                >
                  <LogOut />
                  {t("group.exit")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
                onClick={() => void chatAction("delete")}
              >
                <Trash2 />
                {t("chatMenu.deleteChat")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        )}

        <PinnedBar
          chatId={chatId}
          messages={chat.pinnedMessages}
          onJumpTo={(id) => void jumpTo(id)}
        />

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="wa-scroll relative min-h-0 flex-1 overflow-y-auto py-3"
        >
          {page?.hasMore && (
            <div className="flex justify-center pb-3">
              <LoadOlder chatId={chatId} oldestId={messages[0]?.id} />
            </div>
          )}

          <MessageTimeline
            messages={visible}
            isGroup={isGroup}
            meId={me.id}
            highlighted={highlighted}
            pendingIds={new Set(pending.map((p) => p.id))}
            selected={selected}
            onToggleSelect={toggleSelect}
            onReply={setReplyTo}
            onEdit={setEditing}
            onForward={setForwarding}
            onJumpTo={jumpTo}
          />

          {visible.length === 0 && (
            <p className="py-10 text-center text-sm text-[var(--wa-text-dim)]">
              {t("chat.emptyConversation")}
            </p>
          )}
        </div>

        {!atBottom && (
          <button
            type="button"
            onClick={() => {
              setAtBottom(true);
              scrollToBottom("smooth");
            }}
            aria-label={t("chat.jumpToBottom")}
            className="absolute right-6 bottom-24 flex size-10 items-center justify-center rounded-full bg-[var(--wa-panel)] text-[var(--wa-text-dim)] shadow-md"
          >
            <ChevronDown className="size-5" />
          </button>
        )}

        <Composer
          chatId={chatId}
          disabled={!chat.canSend}
          disabledReason={chat.blockedReason ? t(chat.blockedReason) : null}
          replyTo={replyTo}
          editing={editing}
          initialDraft={chat.draft}
          onCancelReply={() => setReplyTo(null)}
          onCancelEdit={() => setEditing(null)}
          onSent={addOptimistic}
        />
      </div>

      {infoOpen && (
        <GroupInfoPanel chatId={chatId} onClose={() => setInfoOpen(false)} />
      )}

      <ForwardDialog message={forwarding} onClose={() => setForwarding(null)} />

      <DisappearingDialog
        chatId={chatId}
        seconds={chat.disappearingSeconds}
        // A group with "only admins can edit info" locks the timer down the same
        // way it locks the subject — the server enforces it, this just avoids
        // offering an action that would be refused.
        canEdit={
          chat.isMember &&
          (!isGroup || !chat.onlyAdminsCanEditInfo || chat.myRole === "ADMIN")
        }
        open={timerOpen}
        onOpenChange={setTimerOpen}
      />
    </div>
  );
}

/**
 * Day dividers and sender runs.
 *
 * Extracted so the grouping rules live in one place: a new day always breaks a
 * run, and so does a different sender or a five-minute gap. Only the first
 * bubble of a run gets the tail and the sender's name, which is what makes a
 * WhatsApp thread read as a conversation rather than a list.
 */
function MessageTimeline({
  messages,
  isGroup,
  meId,
  highlighted,
  pendingIds,
  selected,
  onToggleSelect,
  onReply,
  onEdit,
  onForward,
  onJumpTo,
}: {
  messages: WaMessage[];
  isGroup: boolean;
  meId: string;
  highlighted: string | null;
  pendingIds: Set<string>;
  selected: string[];
  onToggleSelect: (id: string) => void;
  onReply: (m: WaMessage) => void;
  onEdit: (m: WaMessage) => void;
  onForward: (m: WaMessage) => void;
  onJumpTo: (id: string) => void;
}) {
  const t = useT();
  const locale = useWppLocale();

  return (
    <>
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const newDay = !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);

        const sameSender =
          previous != null &&
          previous.kind !== "SYSTEM" &&
          message.kind !== "SYSTEM" &&
          (previous.sender?.id ?? null) === (message.sender?.id ?? null) &&
          new Date(message.createdAt).getTime() -
            new Date(previous.createdAt).getTime() <
            GROUPING_WINDOW_MS;

        const startsRun = newDay || !sameSender;

        return (
          <div key={message.id}>
            {newDay && (
              <div className="flex justify-center py-3">
                <span className="rounded-md bg-[var(--wa-chip)] px-3 py-1 text-[11px] font-medium tracking-wide text-[var(--wa-chip-ink)] uppercase shadow-sm">
                  {formatDayDivider(message.createdAt, locale, t)}
                </span>
              </div>
            )}
            <MessageBubble
              message={message}
              isGroup={isGroup}
              showTail={startsRun}
              showSender={startsRun && message.sender?.id !== meId}
              highlighted={highlighted === message.id}
              pending={pendingIds.has(message.id)}
              selecting={selected.length > 0}
              selected={selected.includes(message.id)}
              onToggleSelect={onToggleSelect}
              onReply={onReply}
              onEdit={onEdit}
              onForward={onForward}
              onJumpTo={onJumpTo}
            />
          </div>
        );
      })}
    </>
  );
}

/**
 * "Load older messages".
 *
 * Paging writes straight into the SWR cache instead of keeping a second list in
 * component state — otherwise every realtime revalidation would silently throw
 * the older pages away.
 */
function LoadOlder({ chatId, oldestId }: { chatId: string; oldestId?: string }) {
  const t = useT();
  const { mutate } = useSWRConfig();
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!oldestId || loading) return;
    setLoading(true);
    try {
      const older = await wppFetch<{ messages: WaMessage[]; hasMore: boolean }>(
        `${WPP_API}/chats/${chatId}/messages?before=${encodeURIComponent(oldestId)}`,
      );
      await mutate(
        wppKeys.messages(chatId),
        (current: { messages: WaMessage[]; hasMore: boolean } | undefined) => ({
          messages: [...older.messages, ...(current?.messages ?? [])],
          hasMore: older.hasMore,
        }),
        { revalidate: false },
      );
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void load()}
      disabled={loading}
      className="rounded-full bg-[var(--wa-chip)] px-3 py-1 text-xs text-[var(--wa-chip-ink)] shadow-sm disabled:opacity-60"
    >
      {loading ? t("common.loading") : t("chat.loadOlder")}
    </button>
  );
}
