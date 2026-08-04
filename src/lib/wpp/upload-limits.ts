/**
 * Upload constants and pure helpers for the WhatsApp clone.
 *
 * Dependency-free on purpose: the composer (client) and the upload route
 * (server) both import it, and neither should drag the other's dependencies
 * into its bundle. Same discipline as `src/lib/upload-limits.ts`.
 */

export const MAX_WPP_MEDIA_BYTES = 16 * 1024 * 1024; // photos, video, audio
export const MAX_WPP_DOCUMENT_BYTES = 64 * 1024 * 1024;
export const MAX_WPP_AVATAR_BYTES = 4 * 1024 * 1024;
export const MAX_WPP_FILES_PER_MESSAGE = 10;

/**
 * Images we render inline. SVG is excluded deliberately — it can carry script
 * and we serve attachments from our own origin, so an inline <img> of an
 * attacker-supplied SVG would be a stored-XSS vector. SVGs still upload; they
 * just arrive as a document to download.
 */
const INLINE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
]);

const PLAYABLE_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/ogg",
]);

const PLAYABLE_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
]);

/** The message kinds an attachment can produce. Mirrors the `WaMessageKind` enum. */
export type WppAttachmentKind = "IMAGE" | "VIDEO" | "AUDIO" | "VOICE" | "DOCUMENT";

export function isInlineImage(contentType: string): boolean {
  return INLINE_IMAGE_TYPES.has(contentType.toLowerCase());
}

export function isPlayableVideo(contentType: string): boolean {
  return PLAYABLE_VIDEO_TYPES.has(contentType.toLowerCase());
}

export function isPlayableAudio(contentType: string): boolean {
  return PLAYABLE_AUDIO_TYPES.has(contentType.toLowerCase());
}

/**
 * Classify an upload. `voice` is not something we can sniff from the MIME type
 * — a voice note and an uploaded .ogg are the same bytes — so the composer says
 * so explicitly when it hands over a recording.
 */
export function attachmentKind(
  contentType: string,
  opts?: { voice?: boolean },
): WppAttachmentKind {
  if (opts?.voice) return "VOICE";
  if (isInlineImage(contentType)) return "IMAGE";
  if (isPlayableVideo(contentType)) return "VIDEO";
  if (isPlayableAudio(contentType)) return "AUDIO";
  return "DOCUMENT";
}

/** Size ceiling for a given content type. Documents get the bigger budget. */
export function maxBytesFor(contentType: string): number {
  const kind = attachmentKind(contentType);
  return kind === "DOCUMENT" ? MAX_WPP_DOCUMENT_BYTES : MAX_WPP_MEDIA_BYTES;
}

/** Strip directories and control characters; keep it short and printable. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (clean || "file").slice(0, 200);
}

/** File extension including the dot, lowercased — "" when there isn't one. */
export function extensionOf(filename: string): string {
  const m = /\.[A-Za-z0-9]{1,8}$/.exec(filename);
  return m ? m[0].toLowerCase() : "";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** "0:07" / "1:23:45" — the duration label on a voice note or video. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** How many bars the voice-note waveform is drawn with. */
export const WAVEFORM_BUCKETS = 40;

/**
 * Encode amplitude samples for storage: `WAVEFORM_BUCKETS` integers 0-100,
 * comma-separated. Small enough to sit in a TEXT column and to send with every
 * message without thinking about it.
 */
export function encodeWaveform(samples: number[]): string {
  return samples
    .slice(0, WAVEFORM_BUCKETS)
    .map((v) => Math.max(0, Math.min(100, Math.round(v))))
    .join(",");
}

export function decodeWaveform(encoded: string | null | undefined): number[] {
  if (!encoded) return [];
  return encoded
    .split(",")
    .map((v) => Number.parseInt(v, 10))
    .filter((v) => Number.isFinite(v))
    .map((v) => Math.max(0, Math.min(100, v)));
}

export type WppSerializedAttachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  waveform: number[];
  kind: WppAttachmentKind;
  /** Always our own proxy route — object storage isn't reachable from browsers. */
  url: string;
};
