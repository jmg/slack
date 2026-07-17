"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { MessageItem } from "@/components/message-item";
import { dayKey, formatDayDivider } from "@/lib/format";
import type { SerializedMessage } from "@/lib/messages";

const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function MessageList({
  messages,
  onToggleReaction,
  emptyState,
}: {
  messages: SerializedMessage[];
  onToggleReaction: (messageId: string, emoji: string) => void;
  emptyState?: ReactNode;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const count = messages.length;

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [count]);

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
        onToggleReaction={onToggleReaction}
      />,
    );

    lastDay = day;
    lastAuthor = message.author.id;
    lastTime = time;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex min-h-full flex-col justify-end pb-2 pt-4">
        {count === 0 && emptyState}
        {rows}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
