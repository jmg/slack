"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/wpp/i18n-provider";
import { WaAvatar } from "@/components/wpp/wa-avatar";
import {
  formatDuration,
  WAVEFORM_BUCKETS,
  type WppSerializedAttachment,
} from "@/lib/wpp/upload-limits";

/** WhatsApp offers exactly these three, in this order. */
const PLAYBACK_RATES = [1, 1.5, 2] as const;

/** How far an arrow key jumps. Five seconds is WhatsApp's own step. */
const KEYBOARD_STEP_MS = 5_000;

/**
 * FNV-1a over the attachment id. Any stable hash would do; the point is that it
 * is a pure function of the id, so the same note draws the same bars on the
 * server, on first paint and on every re-render after that.
 */
function seedFrom(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * A plausible-looking waveform for notes that arrived without one (uploads we
 * never decoded, or rows written before the analyser existed).
 *
 * Deterministic on purpose: `Math.random()` here would give every render a
 * different silhouette, which reads as a glitch and would break hydration. The
 * amplitudes are kept in a 22-100 band because a bar chart with near-zero bars
 * looks like a failed load rather than quiet audio.
 */
function pseudoWaveform(id: string): number[] {
  let state = seedFrom(id) || 1;
  const bars: number[] = [];
  for (let i = 0; i < WAVEFORM_BUCKETS; i++) {
    // xorshift32 — cheap, no dependency, same sequence everywhere.
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    bars.push(22 + (state % 79));
  }
  return bars;
}

/**
 * Always exactly `WAVEFORM_BUCKETS` bars: a stored waveform can be shorter than
 * the current bucket count (older rows, a truncated encode), and a bar chart
 * that changes width with the recording would make notes impossible to compare.
 */
function waveformBars(id: string, waveform: number[]): number[] {
  if (waveform.length === 0) return pseudoWaveform(id);
  if (waveform.length === WAVEFORM_BUCKETS) return waveform;
  return Array.from({ length: WAVEFORM_BUCKETS }, (_, i) => {
    const source = Math.min(
      waveform.length - 1,
      Math.floor((i * waveform.length) / WAVEFORM_BUCKETS),
    );
    return waveform[source];
  });
}

/**
 * A voice note, drawn the way WhatsApp draws one: sender avatar, play button,
 * a bar chart that doubles as the scrubber, and a playback-rate toggle.
 *
 * One `<audio>` element per note, driven through a ref rather than through
 * React state. Media elements own their playback state; mirroring
 * `currentTime` into state and back would fight the element on every frame, so
 * state here only ever *follows* the element's events.
 */
export function WaVoiceNote({
  attachment,
  mine,
  senderName,
  senderAvatarUrl,
}: {
  attachment: WppSerializedAttachment;
  mine: boolean;
  /** Sender avatar shown beside the play button, as WhatsApp does. */
  senderName?: string;
  senderAvatarUrl?: string | null;
}): React.ReactElement {
  const t = useT();
  const audioRef = useRef<HTMLAudioElement>(null);

  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [measuredMs, setMeasuredMs] = useState(0);
  const [rateIndex, setRateIndex] = useState(0);

  const rate = PLAYBACK_RATES[rateIndex];

  // The server-measured duration wins: MediaRecorder blobs routinely report
  // `Infinity` for `audio.duration` until they have been played end to end,
  // which is precisely why the length is stored alongside the file.
  const durationMs = attachment.durationMs ?? measuredMs;

  const bars = useMemo(
    () => waveformBars(attachment.id, attachment.waveform),
    [attachment.id, attachment.waveform],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setPositionMs(audio.currentTime * 1000);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setPositionMs(0);
      audio.currentTime = 0;
    };
    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration)) setMeasuredMs(audio.duration * 1000);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.playbackRate = rate;
      // Autoplay policies reject this when the gesture isn't trusted; the
      // element stays paused and so must our mirror of its state.
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, [rate]);

  const cycleRate = useCallback(() => {
    setRateIndex((current) => {
      const next = (current + 1) % PLAYBACK_RATES.length;
      const audio = audioRef.current;
      if (audio) audio.playbackRate = PLAYBACK_RATES[next];
      return next;
    });
  }, []);

  const seekTo = useCallback(
    (ms: number) => {
      const clamped = Math.max(0, Math.min(durationMs, ms));
      setPositionMs(clamped);
      const audio = audioRef.current;
      if (audio) audio.currentTime = clamped / 1000;
    },
    [durationMs],
  );

  function seekFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );
    seekTo(ratio * durationMs);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Capture so a drag keeps scrubbing after the pointer leaves the bars.
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromPointer(event);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      seekFromPointer(event);
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      seekTo(positionMs + KEYBOARD_STEP_MS);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      seekTo(positionMs - KEYBOARD_STEP_MS);
    } else if (event.key === "Home") {
      event.preventDefault();
      seekTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      seekTo(durationMs);
    }
  }

  const progress = durationMs > 0 ? positionMs / durationMs : 0;

  // `--wa-text-dim` is tuned for the panel, not for the green outgoing bubble;
  // the chip ink is the token that stays legible on it in both themes.
  const meta = mine
    ? "text-[var(--wa-chip-ink)]"
    : "text-[var(--wa-text-dim)]";

  return (
    <div className="flex w-[min(300px,100%)] items-center gap-2 py-0.5">
      <audio ref={audioRef} src={attachment.url} preload="metadata" />

      {senderName !== undefined && (
        <span className="relative shrink-0">
          <WaAvatar name={senderName} avatarUrl={senderAvatarUrl} size={44} />
          <Mic
            aria-hidden
            className="absolute -right-0.5 bottom-0 size-4 text-[var(--wa-badge)]"
          />
        </span>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? t("media.pause") : t("media.play")}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          "hover:bg-[var(--wa-quote)] focus-visible:bg-[var(--wa-quote)] focus-visible:outline-none",
          meta,
        )}
      >
        {playing ? (
          <Pause className="size-5 fill-current" />
        ) : (
          <Play className="size-5 fill-current" />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label={t("media.seek")}
          aria-valuemin={0}
          aria-valuemax={Math.round(durationMs / 1000)}
          aria-valuenow={Math.round(positionMs / 1000)}
          aria-valuetext={formatDuration(positionMs)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          className="flex h-7 w-full touch-none items-center gap-[2px] rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wa-green)]"
        >
          {bars.map((amplitude, i) => (
            <span
              key={i}
              aria-hidden
              style={{ height: `${Math.max(3, Math.round((amplitude / 100) * 24))}px` }}
              className={cn(
                "min-w-[2px] flex-1 rounded-full",
                i / bars.length < progress
                  ? "bg-[var(--wa-tick-read)]"
                  : "bg-[var(--wa-tick)]",
              )}
            />
          ))}
        </div>

        <div className={cn("flex items-center justify-between text-[11px]", meta)}>
          <span className="tabular-nums">
            {formatDuration(playing || positionMs > 0 ? positionMs : durationMs)}
          </span>
          <button
            type="button"
            onClick={cycleRate}
            aria-label={t("media.playbackSpeed", { rate })}
            className="rounded-full px-1.5 py-0.5 font-medium tabular-nums hover:bg-[var(--wa-quote)] focus-visible:bg-[var(--wa-quote)] focus-visible:outline-none"
          >
            {rate}×
          </button>
        </div>
      </div>
    </div>
  );
}
