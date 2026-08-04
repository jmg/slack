"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Eye,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { WaAvatar } from "@/components/wpp/wa-avatar";
import { useMe, useT, useWppLocale } from "@/components/wpp/i18n-provider";
import { wppError, wppFetch, wppKeys } from "@/lib/wpp/client";
import { STATUS_BACKGROUNDS, WPP_API } from "@/lib/wpp/config";
import { formatShortAge, formatTime } from "@/lib/wpp/format";
import type { WppSerializedAttachment } from "@/lib/wpp/upload-limits";
import type { WaStatusGroup, WaStatusItem } from "@/lib/wpp/types";

/**
 * Status ("Estados"): the 24-hour feed, plus the story viewer that plays it.
 *
 * Left panel is the stack list — mine first, then unseen, then already-viewed —
 * and the right pane is one person's stack playing through. Same two-column
 * shape as the chat screen, and the same phone behaviour: opening a stack takes
 * the whole screen.
 */

/** How long one update stays on screen before the viewer moves on. */
const STORY_MS = 5000;
/** Progress-bar resolution. Small enough to look smooth, coarse enough to be free. */
const TICK_MS = 50;

export function StatusView() {
  const t = useT();
  const me = useMe();

  const { data, isLoading } = useSWR<{ groups: WaStatusGroup[] }>(wppKeys.status);
  const groups = data?.groups ?? [];

  const mine = groups.find((group) => group.isMe) ?? null;
  const others = groups.filter((group) => !group.isMe);
  const recent = others.filter((group) => group.hasUnseen);
  const viewed = others.filter((group) => !group.hasUnseen);

  // The open stack is tracked by author id, not by index: the list re-sorts as
  // soon as an update is seen, and an index would then point at someone else.
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  const open = groups.find((group) => group.user.id === openUserId) ?? null;
  // Stable, because the viewer's playback timer takes it as a dependency —
  // a fresh closure every render would restart the countdown every render.
  const closeViewer = useCallback(() => setOpenUserId(null), [setOpenUserId]);

  return (
    <div className="flex w-full min-w-0">
      <div
        className={cn(
          "flex w-full shrink-0 flex-col border-r border-[var(--wa-border)] bg-[var(--wa-panel)] md:w-[30rem] md:max-w-[40%]",
          open && "hidden md:flex",
        )}
      >
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
          <h1 className="text-xl font-semibold text-[var(--wa-text)]">
            {t("status.title")}
          </h1>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            aria-label={t("status.addStatus")}
            className="flex size-9 items-center justify-center rounded-full text-[var(--wa-text-dim)] transition-colors hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]"
          >
            <Plus className="size-5" />
          </button>
        </header>

        <div className="wa-scroll flex-1 overflow-y-auto">
          <button
            type="button"
            onClick={() =>
              mine ? setOpenUserId(me.id) : setComposerOpen(true)
            }
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--wa-hover)]"
          >
            <span className="relative">
              <WaAvatar
                name={me.name}
                avatarUrl={me.avatarUrl}
                size={48}
                ring={mine ? "seen" : undefined}
              />
              {!mine && (
                <span
                  aria-hidden
                  className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full bg-[var(--wa-green)] text-[var(--wa-green-ink)] ring-2 ring-[var(--wa-panel)]"
                >
                  <Plus className="size-3" />
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] text-[var(--wa-text)]">
                {t("status.myStatus")}
              </span>
              <span className="block truncate text-sm text-[var(--wa-text-dim)]">
                {mine
                  ? formatShortAge(mine.latestAt, t)
                  : t("status.tapToAdd")}
              </span>
            </span>
          </button>

          {isLoading && groups.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--wa-text-dim)]">
              {t("common.loading")}
            </p>
          ) : others.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
              <CircleDashed className="size-8 text-[var(--wa-text-faint)]" />
              <p className="text-sm font-medium text-[var(--wa-text)]">
                {t("status.noUpdates")}
              </p>
              <p className="text-sm text-[var(--wa-text-dim)]">
                {t("status.noUpdatesHint")}
              </p>
            </div>
          ) : (
            <>
              <StatusSection
                title={t("status.recent")}
                groups={recent}
                openUserId={openUserId}
                onOpen={setOpenUserId}
              />
              <StatusSection
                title={t("status.viewed")}
                groups={viewed}
                openUserId={openUserId}
                onOpen={setOpenUserId}
              />
            </>
          )}
        </div>
      </div>

      <div
        className={cn(
          "min-w-0 flex-1 bg-[var(--wa-app)]",
          !open && "hidden md:block",
        )}
      >
        {open ? (
          // Remounting per author is what resets the playhead to the first
          // update — cheaper and less error-prone than syncing an effect.
          <StatusViewer key={open.user.id} group={open} onClose={closeViewer} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <CircleDashed className="size-10 text-[var(--wa-text-faint)]" />
            <p className="text-sm text-[var(--wa-text-dim)]">
              {t("status.selectPrompt")}
            </p>
          </div>
        )}
      </div>

      <StatusComposer open={composerOpen} onOpenChange={setComposerOpen} />
    </div>
  );
}

function StatusSection({
  title,
  groups,
  openUserId,
  onOpen,
}: {
  title: string;
  groups: WaStatusGroup[];
  openUserId: string | null;
  onOpen: (userId: string) => void;
}) {
  const t = useT();
  if (groups.length === 0) return null;

  return (
    <section>
      <h2 className="px-4 pt-4 pb-1 text-xs font-medium tracking-wide text-[var(--wa-text-dim)] uppercase">
        {title}
      </h2>
      <ul>
        {groups.map((group) => (
          <li key={group.user.id}>
            <button
              type="button"
              onClick={() => onOpen(group.user.id)}
              aria-current={openUserId === group.user.id ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                openUserId === group.user.id
                  ? "bg-[var(--wa-selected)]"
                  : "hover:bg-[var(--wa-hover)]",
              )}
            >
              <WaAvatar
                name={group.user.name}
                avatarUrl={group.user.avatarUrl}
                size={48}
                ring={group.hasUnseen ? "unseen" : "seen"}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] text-[var(--wa-text)]">
                  {group.user.name || t("common.deletedAccount")}
                </span>
                <span className="block truncate text-sm text-[var(--wa-text-dim)]">
                  {formatShortAge(group.latestAt, t)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── The story viewer ───────────────────────────────────────────────────────

function StatusViewer({
  group,
  onClose,
}: {
  group: WaStatusGroup;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useWppLocale();
  const { mutate } = useSWRConfig();

  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const count = group.items.length;
  // Deleting your own update shortens the stack under the playhead.
  const safeIndex = Math.min(index, Math.max(0, count - 1));
  const item: WaStatusItem | undefined = group.items[safeIndex];

  /**
   * A view is recorded once per update, guarded by a ref rather than by the
   * `seen` flag on the payload: the flag only flips after the feed is refetched,
   * so between the POST and that round-trip every re-render — and there is one
   * every 50 ms while the bar fills — would fire another request.
   */
  const viewedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!item || group.isMe || viewedRef.current.has(item.id)) return;
    viewedRef.current.add(item.id);
    void wppFetch(`${WPP_API}/status/${item.id}/view`, { method: "POST" })
      .then(() => mutate(wppKeys.status))
      .catch(() => {});
  }, [item, group.isMe, mutate]);

  /**
   * The playhead lives in a ref as well as in state: the ref is what the timer
   * reads and writes, and the state exists only so the progress bar re-renders.
   * Advancing from inside the interval callback — rather than from an effect
   * watching `elapsed` — keeps the whole thing to one render per tick.
   */
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      elapsedRef.current += TICK_MS;
      if (elapsedRef.current < STORY_MS) {
        setElapsed(elapsedRef.current);
        return;
      }
      elapsedRef.current = 0;
      setElapsed(0);
      if (safeIndex + 1 < count) setIndex(safeIndex + 1);
      else onClose();
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [paused, safeIndex, count, onClose]);

  const go = useCallback(
    (delta: number) => {
      elapsedRef.current = 0;
      setElapsed(0);
      setIndex((current) =>
        Math.min(Math.max(current + delta, 0), Math.max(0, count - 1)),
      );
    },
    [count, setElapsed, setIndex],
  );

  // Focus the stage on mount so the arrow keys work without a click first.
  useEffect(() => {
    stageRef.current?.focus();
  }, []);

  async function remove() {
    if (!item || !window.confirm(t("status.deleteConfirm"))) return;
    try {
      await wppFetch(`${WPP_API}/status/${item.id}`, { method: "DELETE" });
      void mutate(wppKeys.status);
      toast.success(t("status.deleted"));
    } catch (err) {
      toast.error(wppError(err, t));
    }
  }

  if (!item) return null;

  const attachment = item.attachment;

  return (
    // The story stage is always dark, in either theme — that is what WhatsApp
    // does, and a status is meant to fill the screen rather than sit in a panel.
    <div className="flex h-full flex-col bg-black">
      <div
        ref={stageRef}
        tabIndex={0}
        role="group"
        aria-label={t("status.title")}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          else if (e.key === "ArrowLeft") go(-1);
          else if (e.key === "ArrowRight") go(1);
          else return;
          e.preventDefault();
        }}
        // Holding the pointer down pauses, like the real thing — release
        // anywhere (including outside the pane) resumes.
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
        onPointerCancel={() => setPaused(false)}
        className="relative flex flex-1 flex-col overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--wa-green)]"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-3 bg-gradient-to-b from-black/60 to-transparent p-3">
          <div className="flex gap-1" aria-hidden>
            {group.items.map((entry, i) => (
              <span
                key={entry.id}
                className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"
              >
                <span
                  className="block h-full rounded-full bg-white"
                  style={{
                    width: `${
                      i < safeIndex
                        ? 100
                        : i === safeIndex
                          ? (elapsed / STORY_MS) * 100
                          : 0
                    }%`,
                  }}
                />
              </span>
            ))}
          </div>

          <div className="pointer-events-auto flex items-center gap-3">
            <WaAvatar
              name={group.user.name}
              avatarUrl={group.user.avatarUrl}
              size={36}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-white">
                {group.isMe ? t("status.myStatus") : group.user.name}
              </span>
              <span className="block text-xs text-white/70">
                {formatTime(item.createdAt, locale)}
              </span>
            </span>
            {group.isMe && (
              <button
                type="button"
                onClick={() => void remove()}
                aria-label={t("status.deleteStatus")}
                className="flex size-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
              >
                <Trash2 className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              className="flex size-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div
          className="flex flex-1 items-center justify-center overflow-hidden"
          style={{
            backgroundColor:
              item.kind === "TEXT" && item.backgroundColor
                ? item.backgroundColor
                : undefined,
          }}
        >
          {attachment && item.kind === "VIDEO" ? (
            <video
              key={attachment.id}
              src={attachment.url}
              autoPlay
              muted
              playsInline
              className="max-h-full max-w-full object-contain"
            />
          ) : attachment ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={attachment.url}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
          ) : null}

          {item.body && (
            <p
              className={cn(
                "wa-text px-8 text-center text-white",
                attachment
                  ? "absolute inset-x-0 bottom-24 text-base drop-shadow-lg"
                  : "text-2xl font-medium",
              )}
            >
              {item.body}
            </p>
          )}
        </div>

        {/* Tap targets, WhatsApp's split: back on the left third, forward on the
            right third, the middle left alone so a long press just pauses. */}
        <button
          type="button"
          onClick={() => go(-1)}
          className="absolute inset-y-0 left-0 z-10 w-1/3 cursor-w-resize outline-none"
        >
          <span className="sr-only">{t("status.previous")}</span>
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          className="absolute inset-y-0 right-0 z-10 w-1/3 cursor-e-resize outline-none"
        >
          <span className="sr-only">{t("status.next")}</span>
        </button>

        <div className="pointer-events-none absolute inset-y-0 left-2 z-20 hidden items-center md:flex">
          <ChevronLeft className="size-6 text-white/40" aria-hidden />
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-2 z-20 hidden items-center md:flex">
          <ChevronRight className="size-6 text-white/40" aria-hidden />
        </div>
      </div>

      {group.isMe && <ViewerList item={item} />}
    </div>
  );
}

/** "Seen by" — only ever rendered for your own updates; the payload carries no
 *  viewers for anyone else's. */
function ViewerList({ item }: { item: WaStatusItem }) {
  const t = useT();
  const locale = useWppLocale();

  return (
    <div className="max-h-48 shrink-0 overflow-y-auto border-t border-white/10 bg-black/40 px-4 py-3 wa-scroll">
      <p className="flex items-center gap-2 text-xs font-medium text-white/70">
        <Eye className="size-3.5" aria-hidden />
        {item.viewers.length > 0
          ? t("status.viewers", { count: item.viewers.length })
          : t("status.noViewers")}
      </p>
      {item.viewers.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {item.viewers.map((viewer) => (
            <li key={viewer.id} className="flex items-center gap-2">
              <WaAvatar name={viewer.name} avatarUrl={viewer.avatarUrl} size={28} />
              <span className="min-w-0 flex-1 truncate text-sm text-white">
                {viewer.name}
              </span>
              <span className="shrink-0 text-xs text-white/60">
                {formatTime(viewer.viewedAt, locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Composer ───────────────────────────────────────────────────────────────

function StatusComposer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const { mutate } = useSWRConfig();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"text" | "photo">("text");
  const [body, setBody] = useState("");
  const [background, setBackground] = useState<string>(STATUS_BACKGROUNDS[0]);
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * The preview URL is minted where the file is chosen, not in an effect, so
   * every `createObjectURL` has exactly one matching `revokeObjectURL`: the one
   * below when it is replaced, and the unmount cleanup for whatever is left.
   * A mirror in a ref is what lets both of those run without the handler having
   * to close over the current value.
   */
  const pickedRef = useRef<{ file: File; url: string } | null>(null);

  function choose(file: File | undefined) {
    if (pickedRef.current) URL.revokeObjectURL(pickedRef.current.url);
    const next = file ? { file, url: URL.createObjectURL(file) } : null;
    pickedRef.current = next;
    setPicked(next);
  }

  useEffect(
    () => () => {
      if (pickedRef.current) URL.revokeObjectURL(pickedRef.current.url);
    },
    [],
  );

  function reset() {
    setMode("text");
    setBody("");
    setBackground(STATUS_BACKGROUNDS[0]);
    choose(undefined);
    if (fileRef.current) fileRef.current.value = "";
  }

  /**
   * Every way out of the dialog goes through here — Escape and the overlay via
   * the Dialog's own `onOpenChange`, and the footer's Cancel, which calls the
   * parent prop directly and would otherwise skip the cleanup. Without it the
   * two dismissals behave differently: reopening after Cancel would still hold
   * the abandoned draft and a photo whose object URL was never revoked.
   */
  function close() {
    onOpenChange(false);
    reset();
  }

  async function post() {
    setSaving(true);
    try {
      let attachmentId: string | undefined;
      if (mode === "photo" && picked) {
        const form = new FormData();
        form.append("file", picked.file);
        form.append("purpose", "STATUS");
        const attachment = await wppFetch<WppSerializedAttachment>(
          `${WPP_API}/uploads`,
          { method: "POST", body: form },
        );
        attachmentId = attachment.id;
      }

      await wppFetch(wppKeys.status, {
        method: "POST",
        json: {
          body: body.trim(),
          // A colour only means anything on a text update; the server drops it
          // for media anyway, so don't pretend otherwise here.
          backgroundColor: mode === "text" ? background : undefined,
          attachmentId,
        },
      });

      void mutate(wppKeys.status);
      toast.success(t("status.posted"));
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setSaving(false);
    }
  }

  const canPost =
    saving === false && (mode === "photo" ? !!picked : body.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("status.addStatus")}</DialogTitle>
        </DialogHeader>

        <div role="group" aria-label={t("status.addStatus")} className="flex gap-2">
          {(["text", "photo"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              aria-pressed={mode === value}
              className={cn(
                "rounded-full px-3 py-1 text-sm transition-colors",
                mode === value
                  ? "bg-[color-mix(in_srgb,var(--wa-green)_22%,transparent)] text-[var(--wa-green)]"
                  : "bg-[var(--wa-app)] text-[var(--wa-text-dim)] hover:text-[var(--wa-text)]",
              )}
            >
              {t(value === "text" ? "status.newTextTitle" : "status.newPhoto")}
            </button>
          ))}
        </div>

        {mode === "text" ? (
          <div className="flex flex-col gap-3">
            <div
              className="flex min-h-40 items-center justify-center rounded-lg p-4"
              style={{ backgroundColor: background }}
            >
              <Textarea
                value={body}
                autoFocus
                maxLength={700}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("status.newTextPlaceholder")}
                aria-label={t("status.newTextPlaceholder")}
                className="resize-none border-transparent bg-transparent text-center text-lg font-medium text-white placeholder:text-white/70 focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
              />
            </div>

            <div role="group" aria-label={t("status.background")} className="flex flex-wrap gap-2">
              {STATUS_BACKGROUNDS.map((color, i) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setBackground(color)}
                  aria-pressed={background === color}
                  // A hex code read aloud is "number 2 5 d 3 6 6"; the position
                  // in the row is the only thing that identifies a swatch.
                  aria-label={t("status.backgroundOption", { index: i + 1 })}
                  className={cn(
                    "size-7 rounded-full border-2 transition-transform",
                    background === color
                      ? "scale-110 border-[var(--wa-text)]"
                      : "border-transparent",
                  )}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              className="sr-only"
              aria-label={t("status.newPhoto")}
              onChange={(e) => choose(e.target.files?.[0])}
            />
            {picked ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={picked.url}
                alt=""
                className="max-h-56 w-full rounded-lg object-contain"
              />
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--wa-divider)] text-sm text-[var(--wa-text-dim)] transition-colors hover:bg-[var(--wa-hover)]"
              >
                <Plus className="size-6" aria-hidden />
                {t("status.newPhoto")}
              </button>
            )}
            <Textarea
              value={body}
              maxLength={700}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("composer.placeholder")}
              aria-label={t("composer.placeholder")}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!canPost}
            onClick={() => void post()}
            className="bg-[var(--wa-green-deep)] text-white hover:bg-[var(--wa-green-hover)]"
          >
            {saving ? t("common.saving") : t("status.post")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
