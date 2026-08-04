"use client";

import { useEffect, useId, useState } from "react";
import { useSWRConfig } from "swr";
import { Copy, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/wpp/i18n-provider";
import { wppError, wppFetch, wppKeys } from "@/lib/wpp/client";
import { WPP_API, wpp } from "@/lib/wpp/config";
import {
  checkUsername,
  normalizeUsername,
  USERNAME_MAX,
  USERNAME_MIN,
  type UsernameProblem,
} from "@/lib/wpp/username";
import type { WppKey } from "@/lib/wpp/i18n";
import type { WaMe } from "@/lib/wpp/types";

/**
 * The public @handle row in Settings → Profile.
 *
 * Follows the pencil-to-edit idiom of the fields around it, with one addition:
 * a handle is *global*, so it can be refused for reasons the form cannot see.
 * Hence the live availability line — and hence the two-stage validation below,
 * where the shared rule module answers what it can and the server is only asked
 * about what is left.
 */

const DEBOUNCE_MS = 400;

/**
 * Rule violation → the key naming it. Deliberately the same mapping the route
 * handler keeps: both sides of the check have to say the same sentence for the
 * local verdict and the server's to be indistinguishable to the reader.
 */
const PROBLEM_KEYS: Record<UsernameProblem, WppKey> = {
  tooShort: "username.errTooShort",
  tooLong: "username.errTooLong",
  charset: "username.errCharset",
  start: "username.errStart",
  end: "username.errEnd",
  doubleUnderscore: "username.errDoubleUnderscore",
  reserved: "username.errReserved",
};

type AvailabilityReply = {
  username: string;
  available: boolean;
  problem: WppKey | null;
};

export function UsernameField({ me }: { me: WaMe }): React.ReactElement {
  const t = useT();
  const { mutate } = useSWRConfig();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  /** `null` clears the handle; the API treats that as "no longer reachable". */
  async function save(username: string | null): Promise<void> {
    setSaving(true);
    try {
      const updated = await wppFetch<WaMe>(wppKeys.me, {
        method: "PATCH",
        json: { username },
      });
      await mutate(wppKeys.me, updated, { revalidate: false });
      toast.success(t("username.saved"));
      setEditing(false);
    } catch (err) {
      // The availability check is advisory: two people can pass it for the same
      // handle in the same moment and the unique index decides. That race comes
      // back as a 409 carrying `username.errTaken`, which reads here like any
      // other server-side refusal.
      toast.error(wppError(err, t));
    } finally {
      setSaving(false);
    }
  }

  async function copyLink(): Promise<void> {
    if (!me.username) return;
    try {
      // Absolute, because the link leaves the app: a bare path is useless in a
      // message somewhere else.
      await navigator.clipboard.writeText(
        `${window.location.origin}${wpp(`/u/${me.username}`)}`,
      );
      toast.success(t("common.copied"));
    } catch (err) {
      toast.error(wppError(err, t));
    }
  }

  if (editing) {
    return (
      <UsernameEditor
        current={me.username}
        saving={saving}
        onCancel={() => setEditing(false)}
        onSave={save}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <FieldLabel>{t("username.label")}</FieldLabel>
          <p className="truncate text-[15px] text-[var(--wa-text)]">
            {me.username ? (
              `@${me.username}`
            ) : (
              <span className="text-[var(--wa-text-dim)]">
                {t("username.none")}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          aria-label={`${t("common.edit")} — ${t("username.label")}`}
          onClick={() => setEditing(true)}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-dim)] transition-colors hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]"
        >
          <Pencil className="size-4" />
        </button>
      </div>

      {me.username ? (
        <>
          <p className="text-xs text-[var(--wa-text-dim)]">
            {t("username.hint", { username: me.username })}
          </p>
          <FieldLabel>{t("username.link")}</FieldLabel>
          {/* The path, not the absolute URL: the origin is only knowable in the
              browser, and reading it while rendering would differ from what the
              server just sent. The copy button is what puts the real link on the
              clipboard. */}
          <p className="truncate rounded-md bg-[var(--wa-app)] px-2 py-1.5 text-xs text-[var(--wa-link)]">
            {wpp(`/u/${me.username}`)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => void copyLink()}>
              <Copy />
              {t("username.copyLink")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => void save(null)}
            >
              {t("common.remove")}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs text-[var(--wa-text-dim)]">
          {t("username.hintEmpty")}
        </p>
      )}
    </div>
  );
}

/**
 * What the availability line is currently saying. `message` carries an already
 * translated sentence because it stands for three different sources — a local
 * rule, the server's verdict and a failed request — and collapsing them here
 * keeps the render free of branching on where the objection came from.
 */
type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; username: string }
  | { kind: "message"; text: string };

/**
 * Mounted only while the field is open, so the draft and the in-flight check
 * are torn down by unmounting rather than by resetting state on cancel.
 */
function UsernameEditor({
  current,
  saving,
  onCancel,
  onSave,
}: {
  current: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (username: string) => Promise<void>;
}) {
  const t = useT();
  const id = useId();
  const [draft, setDraft] = useState(current ?? "");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  /**
   * The shared rules run on the keystroke, the network never does.
   *
   * Two reasons for the split: a handle that cannot be legal has no reason to
   * cost a request, and naming the broken rule immediately is more useful than
   * a debounced "taken" would ever be. Only a draft that survives every local
   * rule reaches `checking`, which is what the effect below waits for.
   */
  function type(raw: string) {
    // Normalized on the way in, so what is checked is exactly what is stored —
    // and so "@Ada" and "ada" are one draft rather than two.
    const value = normalizeUsername(raw);
    setDraft(value);

    if (!value) {
      setStatus({ kind: "idle" });
      return;
    }
    const problem = checkUsername(value);
    setStatus(
      problem
        ? {
            kind: "message",
            text: t(PROBLEM_KEYS[problem], {
              min: USERNAME_MIN,
              max: USERNAME_MAX,
            }),
          }
        : { kind: "checking" },
    );
  }

  useEffect(() => {
    // Every other status is already a final answer; only `checking` is a
    // question for the server.
    if (status.kind !== "checking") return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          // No `wppKeys` entry: this is a one-shot probe nothing else in the
          // app revalidates.
          const reply = await wppFetch<AvailabilityReply>(
            `${WPP_API}/username?u=${encodeURIComponent(draft)}`,
            { signal: controller.signal },
          );
          setStatus(
            reply.available
              ? { kind: "available", username: reply.username }
              : {
                  kind: "message",
                  text: t(reply.problem ?? "username.errTaken", {
                    username: reply.username,
                    min: USERNAME_MIN,
                    max: USERNAME_MAX,
                  }),
                },
          );
        } catch (err) {
          // The cleanup below aborts whatever is in flight, so an abort here
          // means a newer keystroke already owns the answer — dropping it is
          // the whole point, otherwise a slow early reply could overwrite the
          // verdict for text the user has since changed.
          if (controller.signal.aborted) return;
          setStatus({ kind: "message", text: wppError(err, t) });
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draft, status.kind, t]);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        <FieldLabel>{t("username.label")}</FieldLabel>
      </Label>
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-[var(--wa-text-dim)]"
        >
          @
        </span>
        <Input
          id={id}
          autoFocus
          value={draft}
          maxLength={USERNAME_MAX}
          placeholder={t("username.placeholder")}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={`${id}-status`}
          onChange={(e) => type(e.target.value)}
          className="h-9 pl-7"
        />
      </div>

      {/* Announced rather than shown silently: the verdict arrives long after
          the keystroke that asked for it. */}
      <p
        id={`${id}-status`}
        aria-live="polite"
        className={cn(
          "min-h-4 text-xs",
          status.kind === "available"
            ? "text-[var(--wa-green)]"
            : status.kind === "message"
              ? "text-[var(--destructive)]"
              : "text-[var(--wa-text-dim)]",
        )}
      >
        {status.kind === "checking" && t("username.checking")}
        {status.kind === "available" &&
          t("username.available", { username: status.username })}
        {status.kind === "message" && status.text}
      </p>

      <div className="flex justify-end gap-2">
        <Button size="lg" variant="ghost" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          size="lg"
          // Never offer to save a handle the server has not just called free:
          // a rejected PATCH is a worse answer than a disabled button.
          disabled={saving || status.kind !== "available"}
          onClick={() => {
            if (status.kind === "available") void onSave(status.username);
          }}
          className="bg-[var(--wa-green-deep)] text-white hover:bg-[var(--wa-green-hover)]"
        >
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}

/**
 * The uppercase caption the settings cards use. Duplicated rather than exported
 * from `settings-view.tsx` for the same reason `group-info-panel.tsx` keeps its
 * own: three lines of markup is a cheaper price than a cycle between the two
 * modules.
 */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-xs font-medium tracking-wide text-[var(--wa-text-dim)] uppercase">
      {children}
    </span>
  );
}
