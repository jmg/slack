"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { MessageItem } from "@/components/message-item";
import { dayKey, formatDayDivider } from "@/lib/format";
import type { SerializedMessage } from "@/lib/messages";

const GROUP_WINDOW_MS = 5 * 60 * 1000;
// How close to the bottom still counts as "pinned to the bottom".
const STICK_THRESHOLD_PX = 80;

export function MessageList({
  messages,
  currentUserId,
  onToggleReaction,
  onEdit,
  onDelete,
  onOpenThread,
  onMarkUnread,
  emptyState,
  mentionNames,
  canModerate,
  canInteract = true,
}: {
  messages: SerializedMessage[];
  currentUserId: string;
  mentionNames?: string[];
  canModerate?: boolean;
  canInteract?: boolean;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, body: string) => Promise<void>;
  onDelete?: (messageId: string) => void;
  onOpenThread?: (message: SerializedMessage) => void;
  onMarkUnread?: (message: SerializedMessage) => void;
  emptyState?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Whether to keep the view pinned to the bottom as content grows.
  const stick = useRef(true);
  const count = messages.length;
  const targetId = useSearchParams().get("msg");
  const jumpedTo = useRef<string | null>(null);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  // Track whether the user is at/near the bottom (manual scroll). If they scroll
  // up to read history we stop auto-pinning so we don't yank them back down.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
  };

  // On new messages / channel switch: jump to a deep-linked message, else pin to
  // the bottom.
  useEffect(() => {
    if (targetId && jumpedTo.current !== targetId) {
      const el = document.getElementById(`msg-${targetId}`);
      if (el) {
        jumpedTo.current = targetId;
        stick.current = false; // viewing a specific message, don't fight it
        el.scrollIntoView({ block: "center" });
        el.classList.add("permalink-flash");
        const t = setTimeout(() => el.classList.remove("permalink-flash"), 2000);
        return () => clearTimeout(t);
      }
    }
    // Only pin to the bottom if we were already there — don't yank someone who
    // scrolled up to read history. (On a channel switch the list remounts, so
    // stick starts true and we land at the bottom.)
    if (stick.current) scrollToBottom();
  }, [count, targetId]);

  // Late-loading content (avatars, images, link previews) grows the list AFTER
  // the initial scroll. While pinned, re-stick to the bottom on any size change
  // so you always land fully at the newest message.
  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (stick.current) scrollToBottom();
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  const rows: ReactNode[] = [];
  let lastDay = "";
  let lastAuthor = "";
  let lastTime = 0;

  for (const message of messages) {
    const day = dayKey(message.createdAt);
    const time = new Date(message.createdAt).getTime();

    if (day !== lastDay) {
      rows.push(
        <div key={`day-${day}`} className="my-3 flex items-center gap-3 px-4">
          <div className="h-px flex-1 bg-border" />
          <span className="rounded-full border bg-background px-3 py-0.5 text-xs font-semibold text-muted-foreground">
            {formatDayDivider(message.createdAt)}
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>,
      );
      lastAuthor = "";
    }

    const showHeader =
      message.author.id !== lastAuthor || time - lastTime > GROUP_WINDOW_MS;

    rows.push(
      <MessageItem
        key={message.id}
        message={message}
        showHeader={showHeader}
        currentUserId={currentUserId}
        onToggleReaction={onToggleReaction}
        onEdit={onEdit}
        onDelete={onDelete}
        onOpenThread={onOpenThread}
        onMarkUnread={onMarkUnread}
        mentionNames={mentionNames}
        canModerate={canModerate}
        canInteract={canInteract}
      />,
    );

    lastDay = day;
    lastAuthor = message.author.id;
    lastTime = time;
  }

  return (
    <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
      <div ref={contentRef} className="flex min-h-full flex-col justify-end pb-2 pt-4">
        {count === 0 && emptyState}
        {rows}
      </div>
    </div>
  );
}
