/**
 * Upload constants + pure helpers. Deliberately dependency-free so the composer
 * (client) and the upload route (server) can share it without dragging server
 * modules into the client bundle.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_FILES_PER_MESSAGE = 5;

/**
 * Types we render inline. SVG is deliberately excluded: it can carry script, and
 * we serve files from our own origin, so an inline <img> of an attacker-supplied
 * SVG would be an XSS vector. SVGs still upload — they just download instead.
 */
const INLINE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export function isInlineImage(contentType: string): boolean {
  return INLINE_IMAGE_TYPES.has(contentType.toLowerCase());
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
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type SerializedAttachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  isImage: boolean;
  /** Always our own proxy route — object storage is not reachable from browsers. */
  url: string;
};
