"use client";

import { Fragment, useMemo } from "react";
import { cn } from "@/lib/utils";
import { segmentMentions } from "@/lib/wpp/mentions";

/**
 * Message body text.
 *
 * Two jobs: preserve the author's line breaks (the `wa-text` class in
 * globals.css does that with `white-space: pre-wrap`) and turn URLs into links.
 *
 * Linkification is done by splitting the string and rendering React elements,
 * never by building HTML — the body is arbitrary user input, so it must never
 * reach `dangerouslySetInnerHTML`. `rel="noopener noreferrer"` keeps a linked
 * page from touching `window.opener`.
 *
 * `@mentions` are highlighted the same way, and only for tokens the *server*
 * resolved to a real participant (`WaMessage.mentionTokens`) — an "@" inside an
 * email address, or a name nobody in the chat answers to, stays plain text.
 */

// Deliberately conservative: schemes we're willing to link, and a trailing-
// punctuation trim so "see https://example.com." doesn't swallow the full stop.
const URL_PATTERN = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

type Segment = { text: string; href: string | null };

function segment(body: string): Segment[] {
  const out: Segment[] = [];
  let lastIndex = 0;

  for (const match of body.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    let raw = match[0];

    const trailing = TRAILING_PUNCTUATION.exec(raw)?.[0] ?? "";
    if (trailing) raw = raw.slice(0, -trailing.length);
    if (!raw) continue;

    if (start > lastIndex) {
      out.push({ text: body.slice(lastIndex, start), href: null });
    }
    out.push({
      text: raw,
      // Case-insensitively, because the pattern is: a pasted "WWW.EXAMPLE.COM"
      // would otherwise keep the bare host as a *relative* href and navigate
      // inside the app instead of out to the site.
      href: /^www\./i.test(raw) ? `https://${raw}` : raw,
    });
    if (trailing) out.push({ text: trailing, href: null });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < body.length) {
    out.push({ text: body.slice(lastIndex), href: null });
  }
  return out;
}

export function WaText({
  body,
  mentionTokens,
  className,
}: {
  body: string;
  /** Lowercased, `@`-less tokens the server resolved to a participant. */
  mentionTokens?: string[];
  className?: string;
}) {
  // Links first, then mentions inside each plain run: a URL can contain an "@"
  // (`https://x.com/@ada`), and highlighting that as a mention inside an anchor
  // would be both wrong and unclickable.
  const segments = useMemo(() => segment(body), [body]);
  const tokens = useMemo(
    () => new Set(mentionTokens ?? []),
    [mentionTokens],
  );

  return (
    <span className={cn("wa-text", className)}>
      {segments.map((part, i) =>
        part.href ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--wa-link)] underline underline-offset-2"
          >
            {part.text}
          </a>
        ) : (
          <Fragment key={i}>
            {segmentMentions(part.text, tokens).map((run, j) =>
              run.mention ? (
                <span key={j} className="font-medium text-[var(--wa-link)]">
                  {run.text}
                </span>
              ) : (
                <Fragment key={j}>{run.text}</Fragment>
              ),
            )}
          </Fragment>
        ),
      )}
    </span>
  );
}
