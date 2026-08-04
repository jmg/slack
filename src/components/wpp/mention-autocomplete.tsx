"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { WaAvatar } from "@/components/wpp/wa-avatar";
import { useT } from "@/components/wpp/i18n-provider";
import { wppKeys } from "@/lib/wpp/client";
import { waMentionToken, WA_MENTION_EVERYONE } from "@/lib/wpp/mentions";
import type { WaChatDetail } from "@/lib/wpp/types";

export type MentionMatch = {
  id: string;
  name: string;
  avatarUrl: string | null;
  token: string;
};

/**
 * Who the `@token` under the caret could mean.
 *
 * The composer calls this too, and that is the point: it has to know whether
 * the picker is offering anything *before* it decides whether to let the
 * picker have Enter. When only this component knew, the composer swallowed
 * Enter on every half-typed "@word" — including in 1:1 chats, which never
 * offer mentions at all — and the message simply could not be sent.
 *
 * Group chats only: mentioning the one other person in a 1:1 is noise, and
 * WhatsApp doesn't offer it there either.
 */
export function useMentionMatches(
  chatId: string,
  query: string | null,
): MentionMatch[] {
  const t = useT();
  const { data: chat } = useSWR<WaChatDetail>(
    query !== null ? wppKeys.chat(chatId) : null,
  );

  return useMemo(() => {
    if (query === null || !chat || chat.type !== "GROUP") return [];

    const people = chat.members
      .filter((m) => !m.isMe)
      .map((m) => ({
        id: m.id,
        name: m.name,
        avatarUrl: m.avatarUrl,
        token: waMentionToken(m.name).slice(1),
      }))
      .filter((m) => m.token.toLowerCase().startsWith(query));

    // "@all" reaches everyone; offer it alongside the people, as WhatsApp does
    // for group admins, once the typed prefix matches it.
    const everyone = WA_MENTION_EVERYONE[0].slice(1);
    const withEveryone = everyone.startsWith(query)
      ? [{ id: "__everyone", name: t("chat.mentionsYou"), avatarUrl: null, token: everyone }]
      : [];

    return [...withEveryone, ...people].slice(0, 8);
  }, [chat, query, t]);
}

/**
 * The `@` picker above the composer — the list, and nothing else.
 *
 * Rendered only while the caret sits inside an `@token`. The composer owns the
 * detection, the matches and the keyboard, because it owns the textarea and its
 * selection; this component draws what it is handed.
 */
export function MentionAutocomplete({
  matches,
  activeIndex,
  onPick,
}: {
  matches: MentionMatch[];
  /** Index highlighted by the arrow keys, owned by the composer. */
  activeIndex: number;
  onPick: (token: string) => void;
}) {
  const t = useT();

  if (matches.length === 0) return null;

  return (
    <ul
      role="listbox"
      aria-label={t("group.participants", { count: matches.length })}
      className="wa-scroll absolute bottom-full left-3 z-20 mb-1 max-h-56 w-64 overflow-y-auto rounded-lg bg-[var(--wa-panel)] py-1 shadow-lg ring-1 ring-[var(--wa-border)]"
    >
      {matches.map((match, index) => (
        <li key={match.id}>
          <button
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            // The composer keeps focus in the textarea, so a click here must not
            // steal it — losing focus would collapse the caret the pick needs.
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(match.token);
            }}
            className={
              "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm " +
              (index === activeIndex
                ? "bg-[var(--wa-hover)] text-[var(--wa-text)]"
                : "text-[var(--wa-text)]")
            }
          >
            {match.id === "__everyone" ? (
              <span className="flex size-7 items-center justify-center rounded-full bg-[var(--wa-green)] text-xs font-semibold text-[var(--wa-green-ink)]">
                @
              </span>
            ) : (
              <WaAvatar name={match.name} avatarUrl={match.avatarUrl} size={28} />
            )}
            <span className="min-w-0 flex-1 truncate">
              {match.id === "__everyone" ? `@${match.token}` : match.name}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
