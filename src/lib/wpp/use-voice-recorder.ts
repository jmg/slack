"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { encodeWaveform, WAVEFORM_BUCKETS } from "@/lib/wpp/upload-limits";
import type { Translate } from "@/lib/wpp/i18n";

/**
 * Voice notes, recorded in the browser.
 *
 * Two things are produced, not one: the audio itself, and the waveform WhatsApp
 * draws inside the bubble. The waveform has to be sampled *while* recording —
 * deriving it afterwards would mean decoding the whole clip on the main thread —
 * so an `AnalyserNode` is tapped at a fixed interval and the samples are
 * resampled down to `WAVEFORM_BUCKETS` bars on stop.
 *
 * Everything (stream tracks, AudioContext, timers) is torn down on stop, cancel
 * *and* unmount: a live microphone left open after the user navigates away is
 * both a privacy problem and a visible recording indicator in their browser.
 */

export type Recording = {
  blob: Blob;
  durationMs: number;
  /** Encoded for `WaAttachment.waveform`. */
  waveform: string;
};

const SAMPLE_INTERVAL_MS = 100;
/** WhatsApp caps voice notes; this keeps a forgotten tab from recording forever. */
const MAX_DURATION_MS = 5 * 60 * 1000;

export type VoiceRecorder = {
  recording: boolean;
  elapsedMs: number;
  start: (t: Translate) => Promise<void>;
  /** Resolves with the recording, or null if there was nothing usable. */
  stop: () => Promise<Recording | null>;
  cancel: () => void;
};

export function useVoiceRecorder(): VoiceRecorder {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const chunks = useRef<Blob[]>([]);
  const samples = useRef<number[]>([]);
  const startedAt = useRef(0);
  /** Set when the length cap stopped the capture, so the upload reports the
   *  audio's real duration rather than how long the tab sat there. */
  const cappedAt = useRef<number | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sampleTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const teardown = useCallback(() => {
    if (tickTimer.current) clearInterval(tickTimer.current);
    if (sampleTimer.current) clearInterval(sampleTimer.current);
    tickTimer.current = null;
    sampleTimer.current = null;

    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;

    void audioContext.current?.close().catch(() => {});
    audioContext.current = null;

    mediaRecorder.current = null;
    setRecording(false);
    setElapsedMs(0);
  }, []);

  // Never leave the microphone open past this component's life.
  useEffect(() => teardown, [teardown]);

  const start = useCallback(
    async (t: Translate) => {
      if (recording) return;
      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
        toast.error(t("composer.micUnsupported"));
        return;
      }

      try {
        const media = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.current = media;

        const context = new AudioContext();
        audioContext.current = context;
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        context.createMediaStreamSource(media).connect(analyser);
        const buffer = new Uint8Array(analyser.frequencyBinCount);

        chunks.current = [];
        samples.current = [];
        cappedAt.current = null;

        const recorder = new MediaRecorder(media);
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.current.push(e.data);
        };
        recorder.start(250);
        mediaRecorder.current = recorder;
        startedAt.current = Date.now();
        setRecording(true);

        tickTimer.current = setInterval(() => {
          const elapsed = Date.now() - startedAt.current;
          setElapsedMs(elapsed);
          // Hitting the cap has to stop the *timer* as well as the recorder.
          // `recorder.stop()` alone leaves this interval running against an
          // already-inactive MediaRecorder — it throws every 200 ms, the UI
          // keeps counting past the cap, and the duration finally uploaded is
          // the elapsed wall time rather than the audio's real length.
          if (elapsed >= MAX_DURATION_MS) {
            if (tickTimer.current) clearInterval(tickTimer.current);
            tickTimer.current = null;
            cappedAt.current = MAX_DURATION_MS;
            setElapsedMs(MAX_DURATION_MS);
            if (recorder.state !== "inactive") recorder.stop();
          }
        }, 200);

        sampleTimer.current = setInterval(() => {
          analyser.getByteTimeDomainData(buffer);
          // Peak deviation from the 128 midpoint, as a 0-100 amplitude.
          let peak = 0;
          for (const value of buffer) {
            peak = Math.max(peak, Math.abs(value - 128));
          }
          samples.current.push(Math.min(100, Math.round((peak / 128) * 140)));
        }, SAMPLE_INTERVAL_MS);
      } catch {
        teardown();
        toast.error(t("composer.micDenied"));
      }
    },
    [recording, teardown],
  );

  const stop = useCallback(async (): Promise<Recording | null> => {
    const recorder = mediaRecorder.current;
    if (!recorder) return null;

    const durationMs = cappedAt.current ?? Date.now() - startedAt.current;

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () =>
        resolve(new Blob(chunks.current, { type: recorder.mimeType || "audio/webm" }));
      if (recorder.state !== "inactive") recorder.stop();
      else resolve(new Blob(chunks.current, { type: "audio/webm" }));
    });

    // Resample the raw samples down to a fixed number of bars, averaging each
    // bucket so a long note and a short one both render the same width.
    const raw = samples.current;
    const bars: number[] = [];
    if (raw.length > 0) {
      const size = raw.length / WAVEFORM_BUCKETS;
      for (let i = 0; i < WAVEFORM_BUCKETS; i++) {
        const slice = raw.slice(Math.floor(i * size), Math.max(Math.floor((i + 1) * size), Math.floor(i * size) + 1));
        bars.push(slice.reduce((sum, v) => sum + v, 0) / (slice.length || 1));
      }
    }

    teardown();
    // Anything shorter than a blink is a mis-tap, not a message.
    if (blob.size === 0 || durationMs < 400) return null;

    return { blob, durationMs, waveform: encodeWaveform(bars) };
  }, [teardown]);

  const cancel = useCallback(() => {
    const recorder = mediaRecorder.current;
    if (recorder && recorder.state !== "inactive") {
      // Drop the audio on the floor — cancel must not produce a message.
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.stop();
    }
    chunks.current = [];
    samples.current = [];
    teardown();
  }, [teardown]);

  return { recording, elapsedMs, start, stop, cancel };
}
