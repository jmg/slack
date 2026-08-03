"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { ChevronDown, Pin, PinOff } from "lucide-react";
import { toast } from "sonner";
import { useMe, useT } from "@/components/wpp/i18n-provider";
import { wppError, wppFetch, wppKeys } from "@/lib/wpp/client";
import { WPP_API } from "@/lib/wpp/config";
import { chatPreviewParts, previewToString } from "@/lib/wpp/preview";
import type { WaChatDetail, WaMessage } from "@/lib/wpp/types";

/**
 * The strip of pinned messages above the conversation.
 *
 * WhatsApp shows one pin at a time no matter how many there are — the bar is a
 * signpost, not a second timeline — so several pins are cycled through in place
 * rather than stacked, and the count says how many are behind the one on screen.
 *
 * The line is built with `chatPreviewParts`, the helper the chat list and the
 * starred screen use, so a pinned message reads exactly as it does everywhere
 * else it is summarised in one line.
 */
export function PinnedBar({
  chatId,
  messages,
  onJumpTo,
}: {
  chatId: string;
  messages: WaMessage[];
  /** Scroll the conversation to a pinned message. */
  onJumpTo: (messageId: string) => void;
}): React.ReactElement | null {
  const t = useT();
  const me = useMe();
  const { mutate } = useSWRConfig();
  // Only the sender prefix depends on this, and the key is already in SWR's
  // cache — the parent renders this from the very same chat payload.
  const { data: chat } = useSWR<WaChatDetail>(wppKeys.chat(chatId));
  const [cursor, setCursor] = useState(0);

  async function unpin(messageId: string) {
    try {
      await wppFetch(`${WPP_API}/messages/${messageId}/pin`, { method: "POST" });
      void mutate(wppKeys.chat(chatId));
      void mutate(wppKeys.messages(chatId));
    } catch (err) {
      toast.error(wppError(err, t));
    }
  }

  if (messages.length === 0) return null;

  // Modulo rather than a clamped index: it both wraps the cycle back to the
  // first pin and keeps the position valid when the list shrinks under it —
  // unpinning the one on screen must not leave the bar pointing past the end.
  const current = messages[cursor % messages.length];
  const several = messages.length > 1;

  const parts = chatPreviewParts(current, {
    t,
    meId: me.id,
    isGroup: chat?.type === "GROUP",
  });
  const preview = previewToString(parts);

  return (
    <aside
      aria-label={t("chat.pinnedMessages")}
      className="flex shrink-0 items-center gap-2 border-b border-[var(--wa-border)] bg-[var(--wa-header)] px-3 py-1.5"
    >
      <Pin className="size-4 shrink-0 text-[var(--wa-text-dim)]" />

      <button
        type="button"
        onClick={() => onJumpTo(current.id)}
        className="flex min-w-0 flex-1 flex-col items-start rounded-md px-1 py-0.5 text-left transition-colors hover:bg-[var(--wa-hover)]"
      >
        <span className="text-[11px] font-medium text-[var(--wa-green)]">
          {several
            ? t("chat.pinnedCount", { count: messages.length })
            : t("chat.pinnedMessages")}
        </span>
        {/* No `wa-text` here: the bar is one line, and that class preserves the
            author's newlines — a pinned paragraph would push the conversation
            down the screen. */}
        <span className="w-full truncate text-sm text-[var(--wa-text-dim)]">
          {preview}
        </span>
      </button>

      {several && (
        <button
          type="button"
          onClick={() => setCursor((value) => value + 1)}
          aria-label={t("common.next")}
          title={t("common.next")}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-dim)] transition-colors hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]"
        >
          <ChevronDown className="size-4" />
        </button>
      )}

      <button
        type="button"
        onClick={() => void unpin(current.id)}
        aria-label={t("message.unpin")}
        title={t("message.unpin")}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-dim)] transition-colors hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]"
      >
        <PinOff className="size-4" />
      </button>
    </aside>
  );
}
