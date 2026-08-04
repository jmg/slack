"use client";

import { useState } from "react";
import {
  Download,
  File as FileIcon,
  FileArchive,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  Film,
  Music,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/wpp/i18n-provider";
import { WaLightbox } from "@/components/wpp/wa-lightbox";
import { WaVoiceNote } from "@/components/wpp/wa-voice-note";
import {
  extensionOf,
  formatBytes,
  formatDuration,
  type WppSerializedAttachment,
} from "@/lib/wpp/upload-limits";

/** WhatsApp caps media inside a bubble at roughly this; wider just wastes space. */
const MEDIA_WIDTH = "w-[min(330px,100%)]";
const MEDIA_MAX_HEIGHT = "max-h-[330px]";

/**
 * Icon per file family. Matched on the extension rather than the MIME type
 * because that is what the *sender's* OS decided, and it survives the generic
 * `application/octet-stream` that browsers fall back to for unusual files.
 *
 * Written as a branch per family rather than a lookup table of components: a
 * component picked out of a table at render time is a fresh type on every
 * render as far as React is concerned, and it would remount its subtree.
 */
function DocumentGlyph({
  filename,
  className,
}: {
  filename: string;
  className?: string;
}) {
  const ext = extensionOf(filename);
  if (/^\.(pdf|doc|docx|odt|rtf|txt|md|pages)$/.test(ext)) {
    return <FileText className={className} aria-hidden />;
  }
  if (/^\.(xls|xlsx|ods|csv|tsv|numbers)$/.test(ext)) {
    return <FileSpreadsheet className={className} aria-hidden />;
  }
  if (/^\.(zip|rar|7z|tar|gz|bz2|xz)$/.test(ext)) {
    return <FileArchive className={className} aria-hidden />;
  }
  if (/^\.(json|xml|html|css|js|ts|tsx|py|rb|go|rs|sh|sql|yml|yaml)$/.test(ext)) {
    return <FileCode className={className} aria-hidden />;
  }
  if (/^\.(svg|png|jpg|jpeg|gif|webp|avif|heic|bmp|tiff|ico)$/.test(ext)) {
    return <FileImage className={className} aria-hidden />;
  }
  if (/^\.(mp3|wav|ogg|oga|m4a|flac|aac|opus)$/.test(ext)) {
    return <Music className={className} aria-hidden />;
  }
  if (/^\.(mp4|mov|webm|mkv|avi|m4v)$/.test(ext)) {
    return <Film className={className} aria-hidden />;
  }
  return <FileIcon className={className} aria-hidden />;
}

/**
 * A card sitting *inside* a bubble — the document and audio rows.
 *
 * `--wa-quote` is a 6% ink wash: it reads as a raised card on the white
 * incoming bubble, but all but vanishes on the green outgoing one, so own
 * messages get the solid chip surface instead. Both are theme tokens, so dark
 * mode follows without a second rule.
 */
function cardSurface(mine: boolean): string {
  return mine
    ? "bg-[var(--wa-chip)] text-[var(--wa-chip-ink)]"
    : "bg-[var(--wa-quote)] text-[var(--wa-text-dim)]";
}

/**
 * One image tile inside a collage. The intrinsic `width`/`height` go on the
 * element even though CSS crops it to the cell: without them the browser has no
 * aspect ratio to reserve and every arriving photo reflows the whole thread.
 */
function Tile({
  attachment,
  label,
  onOpen,
  className,
  children,
}: {
  attachment: WppSerializedAttachment;
  label: string;
  onOpen: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className={cn(
        "relative block size-full overflow-hidden focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--wa-green)]",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={attachment.url}
        alt={attachment.filename}
        width={attachment.width ?? undefined}
        height={attachment.height ?? undefined}
        className="size-full object-cover"
        loading="lazy"
        decoding="async"
      />
      {children}
    </button>
  );
}

/**
 * The photo collage: 1 photo full width, 2 side by side, 3 as one tall plus two
 * stacked, 4+ as a 2×2 with the remainder counted on the last tile — the same
 * ladder WhatsApp uses, so an album is recognisable at a glance.
 */
function ImageGrid({
  images,
  onOpen,
}: {
  images: WppSerializedAttachment[];
  onOpen: (index: number) => void;
}) {
  const t = useT();
  const openLabel = t("media.openPhoto");

  if (images.length === 1) {
    const only = images[0];
    return (
      <button
        type="button"
        onClick={() => onOpen(0)}
        aria-label={openLabel}
        className="block overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--wa-green)]"
      >
        {only.width && only.height ? (
          // Intrinsic size on the element: the browser reserves the right box
          // before a single byte of the photo arrives, so nothing jumps.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={only.url}
            alt={only.filename}
            width={only.width}
            height={only.height}
            className={cn(
              "h-auto w-auto max-w-full rounded-lg object-cover",
              MEDIA_MAX_HEIGHT,
            )}
            loading="lazy"
            decoding="async"
          />
        ) : (
          // No stored dimensions (an old row, or a format we couldn't probe):
          // reserve a 4:3 box instead so the layout still holds still.
          <span className={cn("block aspect-4/3", MEDIA_WIDTH)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={only.url}
              alt={only.filename}
              className="size-full rounded-lg object-cover"
              loading="lazy"
              decoding="async"
            />
          </span>
        )}
      </button>
    );
  }

  if (images.length === 2) {
    return (
      <div
        className={cn(
          "grid grid-cols-2 gap-[3px] overflow-hidden rounded-lg",
          MEDIA_WIDTH,
        )}
      >
        {images.map((image, i) => (
          <Tile
            key={image.id}
            attachment={image}
            label={openLabel}
            onOpen={() => onOpen(i)}
            className="aspect-square"
          />
        ))}
      </div>
    );
  }

  if (images.length === 3) {
    return (
      <div
        className={cn(
          "grid aspect-3/2 grid-cols-2 grid-rows-2 gap-[3px] overflow-hidden rounded-lg",
          MEDIA_WIDTH,
        )}
      >
        <Tile
          attachment={images[0]}
          label={openLabel}
          onOpen={() => onOpen(0)}
          className="row-span-2"
        />
        <Tile attachment={images[1]} label={openLabel} onOpen={() => onOpen(1)} />
        <Tile attachment={images[2]} label={openLabel} onOpen={() => onOpen(2)} />
      </div>
    );
  }

  const overflow = images.length - 4;
  return (
    <div
      className={cn(
        "grid aspect-square grid-cols-2 grid-rows-2 gap-[3px] overflow-hidden rounded-lg",
        MEDIA_WIDTH,
      )}
    >
      {images.slice(0, 4).map((image, i) => (
        <Tile
          key={image.id}
          attachment={image}
          label={
            i === 3 && overflow > 0
              ? t("media.morePhotos", { count: overflow })
              : openLabel
          }
          onOpen={() => onOpen(i)}
        >
          {i === 3 && overflow > 0 && (
            // A scrim over a photo is black/white in both themes — tinting it
            // with a theme token would tint the photo underneath it.
            <span className="absolute inset-0 grid place-items-center bg-black/50 text-2xl font-medium text-white">
              +{overflow}
            </span>
          )}
        </Tile>
      ))}
    </div>
  );
}

function VideoAttachment({ attachment }: { attachment: WppSerializedAttachment }) {
  const t = useT();
  return (
    <div className={cn("relative overflow-hidden rounded-lg", MEDIA_WIDTH)}>
      {/* `preload="metadata"` so the poster frame and duration are there without
          pulling the whole file down for every video in the backlog. */}
      <video
        src={attachment.url}
        controls
        preload="metadata"
        playsInline
        className={cn("w-full rounded-lg", MEDIA_MAX_HEIGHT)}
      >
        {t("media.videoUnsupported")}
      </video>
      {attachment.durationMs !== null && (
        <span className="pointer-events-none absolute top-2 left-2 rounded bg-black/55 px-1.5 py-0.5 text-[11px] leading-none text-white tabular-nums">
          {formatDuration(attachment.durationMs)}
        </span>
      )}
    </div>
  );
}

function AudioAttachment({
  attachment,
  mine,
}: {
  attachment: WppSerializedAttachment;
  mine: boolean;
}) {
  const t = useT();
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg p-2",
        MEDIA_WIDTH,
        cardSurface(mine),
      )}
    >
      <span className="truncate text-[13px]" title={attachment.filename}>
        {attachment.filename}
      </span>
      <audio src={attachment.url} controls preload="metadata" className="w-full">
        {t("media.audioUnsupported")}
      </audio>
    </div>
  );
}

function DocumentAttachment({
  attachment,
  mine,
}: {
  attachment: WppSerializedAttachment;
  mine: boolean;
}) {
  const ext = extensionOf(attachment.filename).replace(".", "").toUpperCase();

  return (
    <a
      href={attachment.url}
      download={attachment.filename}
      className={cn(
        "flex items-center gap-3 rounded-lg p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--wa-green)]",
        MEDIA_WIDTH,
        cardSurface(mine),
      )}
    >
      <DocumentGlyph filename={attachment.filename} className="size-7 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className="truncate text-[14px] text-[var(--wa-text)]"
          title={attachment.filename}
        >
          {attachment.filename}
        </span>
        <span className="text-[12px] tabular-nums">
          {ext ? `${ext} · ` : ""}
          {formatBytes(attachment.size)}
        </span>
      </span>
      {/* Decorative: the link's accessible name is already the filename. */}
      <Download className="size-5 shrink-0" aria-hidden />
    </a>
  );
}

/**
 * Everything attached to one message, laid out inside its bubble.
 *
 * Photos are collected into a single collage no matter where they sat in the
 * list — WhatsApp does the same, and interleaving a document between two photos
 * of the same album looks broken. Everything else keeps the sender's order
 * underneath.
 *
 * The lightbox lives here rather than in the message component: the collage is
 * the only thing that knows which photos belong together and at which index a
 * click landed.
 */
export function WaAttachments({
  attachments,
  mine,
  caption,
}: {
  attachments: WppSerializedAttachment[];
  /** The message is the viewer's own — affects contrast on some surfaces. */
  mine: boolean;
  /** Caption rendered under the media, inside the same bubble. */
  caption?: string;
}): React.ReactElement | null {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (attachments.length === 0) return null;

  const images = attachments.filter((a) => a.kind === "IMAGE");
  const rest = attachments.filter((a) => a.kind !== "IMAGE");

  return (
    <div className="flex flex-col gap-1.5">
      {images.length > 0 && (
        <ImageGrid images={images} onOpen={setLightboxIndex} />
      )}

      {rest.map((attachment) => {
        switch (attachment.kind) {
          case "VIDEO":
            return <VideoAttachment key={attachment.id} attachment={attachment} />;
          case "VOICE":
            return (
              <WaVoiceNote
                key={attachment.id}
                attachment={attachment}
                mine={mine}
              />
            );
          case "AUDIO":
            return (
              <AudioAttachment
                key={attachment.id}
                attachment={attachment}
                mine={mine}
              />
            );
          default:
            return (
              <DocumentAttachment
                key={attachment.id}
                attachment={attachment}
                mine={mine}
              />
            );
        }
      })}

      {caption ? (
        <p className="wa-text text-[14.2px] leading-[19px] text-[var(--wa-text)]">
          {caption}
        </p>
      ) : null}

      <WaLightbox
        items={images}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
      />
    </div>
  );
}
