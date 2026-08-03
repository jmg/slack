"use client";

import { useId, useState } from "react";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/components/wpp/i18n-provider";
import {
  DISAPPEARING_OPTIONS,
  disappearingLabelKey,
} from "@/lib/wpp/preview";
import { wppError, wppFetch, wppKeys } from "@/lib/wpp/client";
import type { DisappearingSeconds } from "@/lib/wpp/config";

/**
 * WhatsApp's disappearing-messages picker: off, or one of three durations.
 *
 * The rows are generated from `DISAPPEARING_OPTIONS` rather than written out, so
 * the picker and `waDisappearingSchema` — which validates against the same
 * constant — cannot drift into offering a duration the API would reject.
 *
 * Choosing a duration only affects messages sent *after* it; the server never
 * backfills history, and `disappearing.hint` says so before anyone commits.
 */

/**
 * Label per preset, keyed by the value itself so reordering the constant can't
 * silently relabel a row. `Record<DisappearingSeconds, …>` is what makes adding
 * a fourth preset a type error here instead of a missing translation later.
 */
export function DisappearingDialog({
  chatId,
  seconds,
  canEdit,
  open,
  onOpenChange,
}: {
  chatId: string;
  /** Current value, from WaChatDetail.disappearingSeconds. */
  seconds: number | null;
  /** False when the viewer isn't allowed to change it — render read-only. */
  canEdit: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const t = useT();
  const { mutate } = useSWRConfig();
  const radioName = useId();
  const [saving, setSaving] = useState(false);

  /**
   * No local copy of the selection: the radios render straight from the `seconds`
   * prop and the revalidation below is what moves the dot. One source of truth
   * means the picker can never show a duration the chat isn't actually on —
   * including when someone else changes it while this is open.
   */
  async function choose(next: DisappearingSeconds | null) {
    if (next === seconds) return;
    setSaving(true);
    try {
      await wppFetch(`${wppKeys.chat(chatId)}/disappearing`, {
        method: "PATCH",
        json: { seconds: next },
      });
      await mutate(wppKeys.chat(chatId));
      // The timeline gains a system line and the chat list a new preview.
      void mutate(wppKeys.messages(chatId));
      void mutate(wppKeys.chats);
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[var(--wa-text)]">
            {t("disappearing.title")}
          </DialogTitle>
          <DialogDescription className="text-[var(--wa-text-dim)]">
            {t("disappearing.hint")}
          </DialogDescription>
        </DialogHeader>

        {/* `disabled` on the fieldset covers every input inside it, so the
            read-only case and the in-flight case are the same one rule. */}
        <fieldset
          disabled={!canEdit || saving}
          className={cn("-mx-1 flex flex-col", !canEdit && "opacity-70")}
        >
          <legend className="sr-only">{t("disappearing.title")}</legend>
          {DISAPPEARING_OPTIONS.map((option) => (
            <TimerRow
              key={option ?? "off"}
              name={radioName}
              label={t(disappearingLabelKey(option))}
              selected={option === seconds}
              interactive={canEdit}
              onSelect={() => void choose(option)}
            />
          ))}
        </fieldset>

        {!canEdit && (
          <p className="text-xs text-[var(--wa-text-dim)]">
            {seconds == null
              ? t("disappearing.off")
              : t("disappearing.on", { duration: t(disappearingLabelKey(seconds)) })}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * A native radio behind a WhatsApp-shaped dot: the browser keeps arrow-key
 * navigation, the roving focus and the group semantics that a div with
 * `aria-checked` would have to reimplement.
 */
function TimerRow({
  name,
  label,
  selected,
  interactive,
  onSelect,
}: {
  name: string;
  label: string;
  selected: boolean;
  interactive: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
        interactive && "cursor-pointer hover:bg-[var(--wa-hover)]",
      )}
    >
      <input
        type="radio"
        name={name}
        className="peer sr-only"
        checked={selected}
        onChange={onSelect}
      />
      <span
        aria-hidden
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors peer-focus-visible:ring-3 peer-focus-visible:ring-[var(--wa-green)]/40",
          selected
            ? "border-[var(--wa-green)]"
            : "border-[var(--wa-divider)]",
        )}
      >
        {selected && <span className="size-2.5 rounded-full bg-[var(--wa-green)]" />}
      </span>
      <span className="text-sm text-[var(--wa-text)]">{label}</span>
    </label>
  );
}
