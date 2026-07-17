import { Fragment, type ReactNode } from "react";

// Combined tokenizer: URLs, **bold**, `code`, and @mentions. Everything else is
// plain text; newlines are preserved by `whitespace-pre-wrap` on the container.
const PATTERN =
  /(https?:\/\/[^\s]+)|(\*\*[^*\n]+\*\*)|(`[^`\n]+`)|(@[a-zA-Z0-9._-]+)/g;

export function MessageBody({ body }: { body: string }) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of body.matchAll(PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      nodes.push(<Fragment key={key++}>{body.slice(lastIndex, index)}</Fragment>);
    }
    const [token] = match;
    if (match[1]) {
      nodes.push(
        <a
          key={key++}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#1264a3] underline-offset-2 hover:underline"
        >
          {token}
        </a>,
      );
    } else if (match[2]) {
      nodes.push(
        <strong key={key++} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (match[3]) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-[#c7254e]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(
        <span
          key={key++}
          className="rounded bg-[#1264a3]/10 px-0.5 font-medium text-[#1264a3]"
        >
          {token}
        </span>,
      );
    }
    lastIndex = index + token.length;
  }
  if (lastIndex < body.length) {
    nodes.push(<Fragment key={key++}>{body.slice(lastIndex)}</Fragment>);
  }

  return (
    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
      {nodes}
    </div>
  );
}
