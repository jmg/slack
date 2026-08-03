"use client";

import { useId, useState } from "react";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useT } from "@/components/wpp/i18n-provider";
import { wppError, wppFetch, wppKeys } from "@/lib/wpp/client";
import {
  MAX_POLL_OPTION,
  MAX_POLL_OPTIONS,
  MAX_POLL_QUESTION,
  MIN_POLL_OPTIONS,
  WPP_API,
} from "@/lib/wpp/config";

/** The dialog opens on an empty poll with the two rows WhatsApp starts you on. */
const EMPTY_OPTIONS = Array.from({ length: MIN_POLL_OPTIONS }, () => "");

/**
 * A toggle built from a button rather than a checkbox so the knob can animate.
 * `role="switch"` plus `aria-checked` is what makes it announce as a switch, and
 * the label is wired with `aria-labelledby` because `<label for>` only binds to
 * form controls — which a `<button>` is not.
 */
function PollSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <span id={id} className="text-sm text-[var(--wa-text)]">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-[var(--wa-green)]/40",
          checked ? "bg-[var(--wa-green)]" : "bg-[var(--wa-divider)]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-all",
            checked ? "left-[1.375rem]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}

/**
 * WhatsApp's poll composer: a question and a growing list of answers.
 *
 * Blank rows are dropped on send rather than blocked while typing — the list
 * starts with two empty inputs, so validating them as you go would mean opening
 * the dialog straight into an error state.
 */
export function NewPollDialog({
  chatId,
  open,
  onOpenChange,
}: {
  chatId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const t = useT();
  const { mutate } = useSWRConfig();
  const optionsLabelId = useId();

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(EMPTY_OPTIONS);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [saving, setSaving] = useState(false);

  /** Every dismissal — Cancel, Escape, the overlay, a successful send. */
  function close() {
    onOpenChange(false);
    setQuestion("");
    setOptions(EMPTY_OPTIONS);
    setAllowMultiple(false);
  }

  function setOption(index: number, value: string) {
    setOptions((current) =>
      current.map((text, i) => (i === index ? value : text)),
    );
  }

  function addOption() {
    setOptions((current) =>
      current.length < MAX_POLL_OPTIONS ? [...current, ""] : current,
    );
  }

  function removeOption(index: number) {
    setOptions((current) =>
      current.length > MIN_POLL_OPTIONS
        ? current.filter((_, i) => i !== index)
        : current,
    );
  }

  const filled = options.map((text) => text.trim()).filter(Boolean);
  const canSend =
    !saving && question.trim().length > 0 && filled.length >= MIN_POLL_OPTIONS;

  async function send() {
    if (!canSend) return;
    setSaving(true);
    try {
      await wppFetch(`${WPP_API}/chats/${chatId}/polls`, {
        method: "POST",
        json: { question: question.trim(), options: filled, allowMultiple },
      });
      void mutate(wppKeys.messages(chatId));
      void mutate(wppKeys.chats);
      close();
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("poll.newTitle")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wa-poll-question">{t("poll.question")}</Label>
            <Input
              id="wa-poll-question"
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t("poll.questionPlaceholder")}
              maxLength={MAX_POLL_QUESTION}
              className="h-10"
            />
          </div>

          {/*
            A group rather than a `<Label>`: the heading names the whole list,
            and a `<label>` with no control to point at announces as nothing.
          */}
          <div
            role="group"
            aria-labelledby={optionsLabelId}
            className="flex flex-col gap-1.5"
          >
            <span
              id={optionsLabelId}
              className="text-sm leading-none font-medium select-none"
            >
              {t("poll.options")}
            </span>
            <ul className="flex flex-col gap-2">
              {options.map((text, index) => (
                // Index keys: the rows have no identity of their own, and their
                // values are held in state rather than in the DOM.
                <li key={index} className="flex items-center gap-2">
                  <Input
                    value={text}
                    onChange={(e) => setOption(index, e.target.value)}
                    aria-label={t("poll.optionPlaceholder", { index: index + 1 })}
                    placeholder={t("poll.optionPlaceholder", { index: index + 1 })}
                    maxLength={MAX_POLL_OPTION}
                    className="h-10"
                  />
                  {options.length > MIN_POLL_OPTIONS && (
                    <button
                      type="button"
                      onClick={() => removeOption(index)}
                      aria-label={t("common.remove")}
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-dim)] hover:bg-[var(--wa-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wa-green)]"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {options.length < MAX_POLL_OPTIONS && (
              <Button
                variant="ghost"
                onClick={addOption}
                className="self-start text-[var(--wa-green)]"
              >
                <Plus className="size-4" />
                {t("poll.addOption")}
              </Button>
            )}
          </div>

          <PollSwitch
            label={t("poll.allowMultiple")}
            checked={allowMultiple}
            onChange={setAllowMultiple}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!canSend}
            onClick={() => void send()}
            className="bg-[var(--wa-green-deep)] text-white hover:bg-[var(--wa-green-hover)]"
          >
            {saving ? t("common.saving") : t("poll.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
