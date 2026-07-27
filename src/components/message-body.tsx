import { Fragment, type ReactNode } from "react";

/**
 * Lightweight Markdown subset rendered as pure React nodes (never
 * dangerouslySetInnerHTML, so it stays XSS-safe). Block level: ``` fenced code,
 * `>` blockquotes, `-`/`*` and `1.` lists, paragraphs. Inline: links, **bold**,
 * *italic* / _italic_, ~strike~, `code`, and @mentions.
 */

// Underscore-italic is intentionally omitted: it collides with snake_case in a
// dev chat, and a lookbehind guard risks a regex parse error on older engines.
const INLINE =
  /(https?:\/\/[^\s]+)|(\*\*[^*\n]+\*\*)|(~[^~\n]+~)|(`[^`\n]+`)|(\*[^*\n]+\*)|(@[a-zA-Z0-9._-]+)/g;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Build the inline regex for a message. When we know the workspace's member
 * names we widen the @mention alternative to match a full display name (which
 * contains spaces) — longest name first so "@Juan Manuel Garcia" wins over
 * "@Juan". Without member names we fall back to the static single-word regex.
 */
function inlineRegexFor(mentionNames?: string[]): RegExp {
  const names = (mentionNames ?? []).filter((n) => n && n.trim());
  if (names.length === 0) return INLINE;
  const alts = [
    ...names
      .map((n) => n.trim().replace(/\s+/g, " "))
      .sort((a, b) => b.length - a.length)
      .map(escapeRe),
    "channel",
    "here",
    "everyone",
  ];
  // A known full name / broadcast, else any bare single-word handle.
  const mention = `@(?:${alts.join("|")}|[a-zA-Z0-9._-]+)`;
  return new RegExp(
    `(https?:\\/\\/[^\\s]+)|(\\*\\*[^*\\n]+\\*\\*)|(~[^~\\n]+~)|(\`[^\`\\n]+\`)|(\\*[^*\\n]+\\*)|(${mention})`,
    "g",
  );
}

function renderInline(text: string, kp: string, re: RegExp = INLINE): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) {
      nodes.push(<Fragment key={`${kp}-${k++}`}>{text.slice(last, i)}</Fragment>);
    }
    const [tok] = m;
    if (m[1]) {
      nodes.push(
        <a
          key={`${kp}-${k++}`}
          href={tok}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#1264a3] underline-offset-2 hover:underline"
        >
          {tok}
        </a>,
      );
    } else if (m[2]) {
      nodes.push(
        <strong key={`${kp}-${k++}`} className="font-semibold">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (m[3]) {
      nodes.push(
        <span key={`${kp}-${k++}`} className="line-through">
          {tok.slice(1, -1)}
        </span>,
      );
    } else if (m[4]) {
      nodes.push(
        <code
          key={`${kp}-${k++}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-[#c7254e]"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (m[5]) {
      nodes.push(
        <em key={`${kp}-${k++}`} className="italic">
          {tok.slice(1, -1)}
        </em>,
      );
    } else {
      nodes.push(
        <span
          key={`${kp}-${k++}`}
          className="rounded bg-[#1264a3]/10 px-0.5 font-medium text-[#1264a3]"
        >
          {tok}
        </span>,
      );
    }
    last = i + tok.length;
  }
  if (last < text.length) {
    nodes.push(<Fragment key={`${kp}-${k++}`}>{text.slice(last)}</Fragment>);
  }
  return nodes;
}

const QUOTE = /^>\s?/;
const UL = /^\s*[-*]\s+/;
const OL = /^\s*\d+\.\s+/;

/** Parse non-code text into blockquote / list / paragraph blocks. */
function renderTextBlocks(
  text: string,
  nextKey: () => string,
  re: RegExp = INLINE,
): ReactNode[] {
  const lines = text.replace(/^\n+|\n+$/g, "").split("\n");
  const out: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (QUOTE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) buf.push(lines[i++].replace(QUOTE, ""));
      out.push(
        <blockquote
          key={nextKey()}
          className="my-0.5 whitespace-pre-wrap break-words border-l-2 border-border pl-3 text-foreground/75"
        >
          {renderInline(buf.join("\n"), "bq", re)}
        </blockquote>,
      );
    } else if (UL.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL.test(lines[i])) items.push(lines[i++].replace(UL, ""));
      out.push(
        <ul key={nextKey()} className="my-0.5 list-disc space-y-0.5 pl-5">
          {items.map((it, idx) => (
            <li key={idx} className="break-words">
              {renderInline(it, `ul${idx}`, re)}
            </li>
          ))}
        </ul>,
      );
    } else if (OL.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL.test(lines[i])) items.push(lines[i++].replace(OL, ""));
      out.push(
        <ol key={nextKey()} className="my-0.5 list-decimal space-y-0.5 pl-5">
          {items.map((it, idx) => (
            <li key={idx} className="break-words">
              {renderInline(it, `ol${idx}`, re)}
            </li>
          ))}
        </ol>,
      );
    } else {
      const buf: string[] = [];
      while (
        i < lines.length &&
        !QUOTE.test(lines[i]) &&
        !UL.test(lines[i]) &&
        !OL.test(lines[i])
      ) {
        buf.push(lines[i++]);
      }
      const para = buf.join("\n");
      if (para.trim() !== "") {
        out.push(
          <p key={nextKey()} className="whitespace-pre-wrap break-words">
            {renderInline(para, "p", re)}
          </p>,
        );
      }
    }
  }
  return out;
}

const FENCE = /```(?:[a-zA-Z0-9+-]*\n)?([\s\S]*?)```/g;

export function MessageBody({
  body,
  mentionNames,
}: {
  body: string;
  /** Workspace member display names, so full-name @mentions highlight fully. */
  mentionNames?: string[];
}) {
  const blocks: ReactNode[] = [];
  let n = 0;
  const nextKey = () => `b${n++}`;
  const re = inlineRegexFor(mentionNames);

  let last = 0;
  for (const m of body.matchAll(FENCE)) {
    const i = m.index ?? 0;
    if (i > last) blocks.push(...renderTextBlocks(body.slice(last, i), nextKey, re));
    blocks.push(
      <pre
        key={nextKey()}
        className="my-1 overflow-x-auto rounded-md bg-muted p-3 font-mono text-[0.85em]"
      >
        <code>{m[1].replace(/\n$/, "")}</code>
      </pre>,
    );
    last = i + m[0].length;
  }
  if (last < body.length) blocks.push(...renderTextBlocks(body.slice(last), nextKey, re));

  return (
    <div className="space-y-1 text-sm leading-relaxed text-foreground/90">
      {blocks}
    </div>
  );
}
