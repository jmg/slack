"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { useT } from "@/components/wpp/i18n-provider";
import type { WppSerializedAttachment } from "@/lib/wpp/upload-limits";

/**
 * Fullscreen photo viewer, opened from the image grid inside a bubble.
 *
 * Fully controlled: the owner keeps `index` so the same viewer can be reused for
 * a single photo or a whole album without duplicating navigation state.
 *
 * Two deliberate choices:
 *
 * 1. It renders into `<body>` through a portal. `position: fixed` is measured
 *    against the *nearest ancestor with a transform/filter/`contain`*, not the
 *    viewport — and the lightbox is mounted deep inside a scrolling, animated
 *    message list, so keeping it in place would eventually clip it to a bubble.
 * 2. The chrome is black-on-white regardless of theme. A photo viewer is a
 *    media surface, not an app surface: WhatsApp dims to near-black in light
 *    mode too, and a themed panel around a photo would tint how it reads.
 */
export function WaLightbox({
  items,
  index,
  onIndexChange,
}: {
  items: WppSerializedAttachment[];
  /** Index of the item to open at; null closes the lightbox. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
}): React.ReactElement | null {
  const t = useT();
  const dialogRef = useRef<HTMLDivElement>(null);

  const at = index ?? 0;
  const open = index !== null && at >= 0 && at < items.length;
  const current = open ? items[at] : null;

  const close = useCallback(() => onIndexChange(null), [onIndexChange]);

  const go = useCallback(
    (delta: number) => {
      if (items.length < 2) return;
      onIndexChange((at + delta + items.length) % items.length);
    },
    [at, items.length, onIndexChange],
  );

  // Listening on the document rather than the dialog: the focused element can
  // be a button inside it, and Escape must work wherever focus has wandered.
  //
  // Tab is handled here too, and that part is not a nicety. `aria-modal` is a
  // promise to assistive tech that nothing outside the dialog is reachable;
  // without a trap, tabbing walks focus into the message list *behind* the
  // black overlay, where a keyboard user can activate controls they cannot see —
  // "Delete for everyone" among them.
  useEffect(() => {
    if (!open) return;

    function focusables(): HTMLElement[] {
      const root = dialogRef.current;
      if (!root) return [];
      return [
        ...root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        go(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
      } else if (event.key === "Tab") {
        const stops = focusables();
        if (stops.length === 0) {
          event.preventDefault();
          dialogRef.current?.focus();
          return;
        }
        const first = stops[0];
        const last = stops[stops.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close, go]);

  // Restore the previous inline value instead of clearing it, so we don't undo
  // a scroll lock some other overlay put there first.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Move focus in on open, and hand it back to whatever opened the viewer on
  // close. Without the restore, closing leaves focus on <body> and the next Tab
  // starts over from the top of the page instead of at the thumbnail.
  useEffect(() => {
    if (!open) return;
    const returnTo = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => returnTo?.focus?.();
  }, [open]);

  // `createPortal` needs a real DOM. Nothing is lost by bailing out during SSR:
  // a lightbox is only ever opened by a click, so `index` is null on the server
  // and on the hydrating render alike — the two agree on rendering nothing.
  if (!open || !current || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t("media.viewer")}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white outline-none"
    >
      <header className="flex shrink-0 items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1 truncate text-sm" title={current.filename}>
          {current.filename}
        </span>
        {items.length > 1 && (
          <span className="shrink-0 text-xs tabular-nums opacity-70">
            {t("media.photoCounter", { index: at + 1, total: items.length })}
          </span>
        )}
        <button
          type="button"
          onClick={close}
          aria-label={t("common.close")}
          className="shrink-0 rounded-full p-1.5 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
        >
          <X className="size-5" />
        </button>
      </header>

      {/* Only a click that lands on this padding — not on the photo or the
          arrows, which are children — counts as a backdrop click. */}
      <div
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={current.filename}
          width={current.width ?? undefined}
          height={current.height ?? undefined}
          className="max-h-full max-w-full object-contain"
          decoding="async"
        />

        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label={t("media.previousPhoto")}
              className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/40 p-2 hover:bg-black/60 focus-visible:bg-black/60 focus-visible:outline-none"
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label={t("media.nextPhoto")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/40 p-2 hover:bg-black/60 focus-visible:bg-black/60 focus-visible:outline-none"
            >
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-center px-4 py-3">
        <a
          href={current.url}
          download={current.filename}
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm hover:bg-white/10 focus-visible:bg-white/10 focus-visible:outline-none"
        >
          <Download className="size-4" />
          {t("message.download")}
        </a>
      </footer>
    </div>,
    document.body,
  );
}
