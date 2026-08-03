"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMe, useT } from "@/components/wpp/i18n-provider";
import { wppError, wppFetch, wppKeys } from "@/lib/wpp/client";
import { WPP_API } from "@/lib/wpp/config";
import type { WaMessage, WaPollResult } from "@/lib/wpp/types";

type MessagePage = { messages: WaMessage[]; hasMore: boolean };

/**
 * The poll as it will look once the server has stored `nextIds` for the viewer.
 *
 * Computed rather than fetched so the bar moves on the tap: the authoritative
 * tally arrives moments later on the realtime signal, and this only has to be
 * right about the one voter it knows everything about — us.
 */
function applyVote(
  poll: WaPollResult,
  nextIds: string[],
  myName: string,
): WaPollResult {
  const picked = new Set(nextIds);

  const options = poll.options.map((option) => {
    const mine = picked.has(option.id);
    if (mine === option.mine) return option;
    // Drop one occurrence by position, not by value: two participants can share
    // a display name, and filtering by name would erase the wrong voter.
    const at = option.voters.indexOf(myName);
    return {
      ...option,
      mine,
      votes: option.votes + (mine ? 1 : -1),
      voters: mine
        ? [...option.voters, myName]
        : at === -1
          ? option.voters
          : [...option.voters.slice(0, at), ...option.voters.slice(at + 1)],
    };
  });

  // `totalVoters` counts people, not votes, so it only moves when we go from
  // having no vote to having one, or back.
  const votedBefore = poll.options.some((option) => option.mine);
  const votedAfter = nextIds.length > 0;
  return {
    ...poll,
    options,
    totalVoters:
      poll.totalVoters + (votedAfter ? 1 : 0) - (votedBefore ? 1 : 0),
  };
}

function withPoll(
  page: MessagePage | undefined,
  messageId: string,
  poll: WaPollResult,
): MessagePage {
  return {
    messages: (page?.messages ?? []).map((message) =>
      message.id === messageId ? { ...message, poll } : message,
    ),
    hasMore: page?.hasMore ?? false,
  };
}

/**
 * A poll inside a message bubble: question, options with their share of the
 * vote, and — for the author — the control that stops it.
 *
 * Voting sends the whole selection rather than the option that was tapped,
 * because that is what the endpoint stores (see the vote route): one call
 * covers picking, changing and clearing, and the optimistic state above is then
 * just the same selection applied locally.
 */
export function WaPoll({
  poll,
  messageId,
  chatId,
  mine,
}: {
  poll: WaPollResult;
  messageId: string;
  chatId: string;
  mine: boolean;
}): React.ReactElement {
  const t = useT();
  const me = useMe();
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState(false);
  const [showVotes, setShowVotes] = useState(false);

  const key = wppKeys.messages(chatId);
  const selected = poll.options.filter((option) => option.mine).map((o) => o.id);

  async function submit(nextIds: string[]) {
    setBusy(true);
    try {
      await mutate(
        key,
        (current: MessagePage | undefined) =>
          withPoll(current, messageId, applyVote(poll, nextIds, me.name)),
        { revalidate: false },
      );
      await wppFetch(`${WPP_API}/polls/${poll.id}/vote`, {
        method: "POST",
        json: { optionIds: nextIds },
      });
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setBusy(false);
      // The server's tally wins — and rolls the optimistic bar back when the
      // request never landed.
      void mutate(key);
    }
  }

  function toggle(optionId: string) {
    if (busy || poll.closed) return;
    const isSelected = selected.includes(optionId);
    const next = poll.allowMultiple
      ? isSelected
        ? selected.filter((id) => id !== optionId)
        : [...selected, optionId]
      : // Tapping your own answer again clears it, as WhatsApp allows.
        isSelected
        ? []
        : [optionId];
    void submit(next);
  }

  async function stop() {
    if (busy || !window.confirm(t("poll.closeConfirm"))) return;
    setBusy(true);
    try {
      await wppFetch(`${WPP_API}/polls/${poll.id}/close`, { method: "POST" });
      void mutate(key);
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setBusy(false);
    }
  }

  // `--wa-text-dim` is tuned for the panel, not for the green outgoing bubble;
  // the chip ink is the token that stays legible on it in both themes.
  const meta = mine ? "text-[var(--wa-chip-ink)]" : "text-[var(--wa-text-dim)]";
  // Same problem for the bar's track: a solid divider grey disappears into the
  // green bubble, so that side gets the translucent overlay token instead —
  // it darkens or lightens with whatever bubble it lands on.
  const track = mine ? "bg-[var(--wa-quote)]" : "bg-[var(--wa-divider)]";

  const totalLabel =
    poll.totalVoters === 0
      ? t("poll.noVotes")
      : poll.totalVoters === 1
        ? t("poll.oneVote")
        : t("poll.votes", { count: poll.totalVoters });

  return (
    <div className="flex w-[min(320px,100%)] flex-col gap-2 py-0.5">
      <div className="flex items-start gap-2">
        <BarChart3 aria-hidden className={cn("mt-0.5 size-4 shrink-0", meta)} />
        <div className="min-w-0 flex-1">
          <p className="font-medium break-words whitespace-pre-wrap">
            {poll.question}
          </p>
          <p className={cn("text-xs", meta)}>
            {poll.allowMultiple ? t("poll.selectMany") : t("poll.selectOne")}
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {poll.options.map((option) => {
          // Never divide by zero, and an option with no votes still needs a
          // track to sit in.
          const share = option.votes / Math.max(1, poll.totalVoters);
          return (
            <li key={option.id} className="flex flex-col gap-1">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type={poll.allowMultiple ? "checkbox" : "radio"}
                  name={`wa-poll-${messageId}`}
                  checked={option.mine}
                  disabled={poll.closed || busy}
                  // `readOnly` because the state lives in the message payload,
                  // not in the input: React would warn about a controlled field
                  // without `onChange`, and `onChange` never fires when you tap
                  // the radio you already chose — which is how you clear a vote.
                  readOnly
                  onClick={() => toggle(option.id)}
                  className="size-4 shrink-0 accent-[var(--wa-green)]"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 break-words">{option.text}</span>
                    <span className={cn("shrink-0 text-xs tabular-nums", meta)}>
                      {option.votes}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn("h-1 w-full overflow-hidden rounded-full", track)}
                  >
                    <span
                      className="block h-full rounded-full bg-[var(--wa-green)] transition-[width] duration-200"
                      style={{ width: `${Math.round(share * 100)}%` }}
                    />
                  </span>
                </span>
              </label>

              {showVotes && option.voters.length > 0 && (
                <p className={cn("pl-6 text-xs break-words", meta)}>
                  {option.voters.join(", ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-xs", meta)}>
        <span>{totalLabel}</span>

        {poll.totalVoters > 0 && (
          <button
            type="button"
            aria-expanded={showVotes}
            onClick={() => setShowVotes((current) => !current)}
            className="rounded font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wa-green)]"
          >
            {t("poll.viewVotes")}
          </button>
        )}

        {poll.closed ? (
          <span className="font-medium">{t("poll.closed")}</span>
        ) : (
          poll.canClose && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void stop()}
              className="rounded font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wa-green)] disabled:opacity-50"
            >
              {t("poll.close")}
            </button>
          )
        )}
      </div>
    </div>
  );
}
