"use client";

import { Download, FileText } from "lucide-react";
import { formatBytes, type SerializedAttachment } from "@/lib/upload-limits";

/**
 * Attachments under a message. Images render inline; everything else is a chip
 * that downloads. Note `next/image` is unusable here: the optimizer fetches the
 * source server-side without the viewer's session cookie, so our authorized
 * proxy would answer 401.
 */
export function AttachmentList({
  attachments,
}: {
  attachments: SerializedAttachment[];
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap items-start gap-2">
      {attachments.map((a) =>
        a.isImage ? (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-lg border bg-muted/30 transition hover:border-foreground/20"
            title={a.filename}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.url}
              alt={a.filename}
              width={a.width ?? undefined}
              height={a.height ?? undefined}
              loading="lazy"
              className="max-h-64 w-auto max-w-sm object-contain"
            />
          </a>
        ) : (
          <a
            key={a.id}
            href={a.url}
            className="group/file flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm transition hover:bg-muted"
            title={`Download ${a.filename}`}
          >
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="max-w-[16rem] truncate font-medium">
              {a.filename}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatBytes(a.size)}
            </span>
            <Download className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover/file:opacity-100" />
          </a>
        ),
      )}
    </div>
  );
}
