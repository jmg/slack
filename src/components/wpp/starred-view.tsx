"use client";

import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";
import { Star, StarOff } from "lucide-react";
import { toast } from "sonner";
import { WaAvatar } from "@/components/wpp/wa-avatar";
import { useMe, useT, useWppLocale } from "@/components/wpp/i18n-provider";
import { wppError, wppFetch, wppKeys } from "@/lib/wpp/client";
import { WPP_API, wpp } from "@/lib/wpp/config";
import { formatListTimestamp } from "@/lib/wpp/format";
import { chatPreviewParts, previewToString } from "@/lib/wpp/preview";
import type { WaSearchHit } from "@/lib/wpp/types";

/**
 * Starred messages.
 *
 * A star is a bookmark, not a copy: the server re-applies the ordinary
 * visibility rules on the way out, so a hit that disappears here did so because
 * the message itself is gone. Nothing on this screen needs to handle that case —
 * the row simply stops arriving.
 *
 * Rows are rendered from `chatPreviewParts`, the same helper the chat list uses,
 * so a starred message reads exactly like the row it was starred from.
 */
export function StarredView() {
  const t = useT();
  const { data, isLoading } = useSWR<{ hits: WaSearchHit[] }>(wppKeys.starred);
  const hits = data?.hits ?? [];

  return (
    <div className="wa-scroll flex w-full flex-col overflow-y-auto bg-[var(--wa-panel)]">
      <header className="flex h-14 shrink-0 items-center px-4">
        <h1 className="text-xl font-semibold text-[var(--wa-text)]">
          {t("starred.title")}
        </h1>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 px-2 pb-8">
        {isLoading && hits.length === 0 ? (
          <p className="px-2 py-6 text-sm text-[var(--wa-text-dim)]">
            {t("common.loading")}
          </p>
        ) : hits.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-8 py-20 text-center">
            <Star className="size-8 text-[var(--wa-text-faint)]" />
            <p className="text-sm font-medium text-[var(--wa-text)]">
              {t("starred.empty")}
            </p>
            <p className="text-sm text-[var(--wa-text-dim)]">
              {t("starred.emptyHint")}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {hits.map((hit) => (
              <StarredRow key={hit.message.id} hit={hit} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StarredRow({ hit }: { hit: WaSearchHit }) {
  const t = useT();
  const me = useMe();
  const locale = useWppLocale();
  const { mutate } = useSWRConfig();

  const { message } = hit;
  const parts = chatPreviewParts(message, {
    t,
    meId: me.id,
    // The sender prefix is what tells two people apart in a group thread; in a
    // 1:1 the chat name already says who it is.
    isGroup: hit.chatType === "GROUP",
  });

  const senderName = message.mine
    ? t("common.you")
    : (message.sender?.name ?? t("common.deletedAccount"));

  async function unstar() {
    try {
      await wppFetch(`${WPP_API}/messages/${message.id}/star`, { method: "POST" });
      void mutate(wppKeys.starred);
      void mutate(wppKeys.messages(hit.chatId));
    } catch (err) {
      toast.error(wppError(err, t));
    }
  }

  return (
    <li className="group/star relative flex items-center gap-2 border-b border-[var(--wa-border)] last:border-transparent">
      <Link
        href={wpp(`/chats/${hit.chatId}`)}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-lg p-3 transition-colors hover:bg-[var(--wa-hover)]"
      >
        <WaAvatar
          name={hit.chatName}
          avatarUrl={hit.chatAvatarUrl}
          group={hit.chatType === "GROUP"}
          size={40}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[15px] text-[var(--wa-text)]">
              {hit.chatName || t("common.deletedAccount")}
            </span>
            <span className="shrink-0 text-[11px] text-[var(--wa-text-dim)]">
              {formatListTimestamp(message.createdAt, locale, t)}
            </span>
          </span>
          <span className="truncate text-xs text-[var(--wa-text-dim)]">
            {senderName}
          </span>
          <span className="wa-text line-clamp-2 text-sm text-[var(--wa-text-dim)]">
            {previewToString(parts)}
          </span>
        </span>
      </Link>

      <button
        type="button"
        onClick={() => void unstar()}
        aria-label={t("message.unstar")}
        title={t("message.unstar")}
        className="mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-dim)] transition-colors hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]"
      >
        <StarOff className="size-4" />
      </button>
    </li>
  );
}
