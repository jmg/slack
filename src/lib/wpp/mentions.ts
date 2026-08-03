/**
 * `@mentions` in group messages.
 *
 * ## Why a token, and why the first name
 * WhatsApp stores mentions as account ids with character offsets into the body,
 * so it can render each viewer's own saved name for the same mention. Offsets
 * are fragile to edit (every edit has to re-map them) and buy little here, so a
 * mention is instead a plain `@token` in the text, resolved server-side into
 * `WaMention` rows.
 *
 * The token is the *first word* of the display name: it can't contain a space,
 * which is what makes it unambiguous to find in free text. Two people called Ada
 * in one group both get mentioned — the honest outcome, and the same one the
 * Slack half of this repo settled on (`src/lib/mentions.ts`).
 *
 * Dependency-free: the composer's autocomplete, the bubble's highlighter and the
 * send handler all import it.
 */

/** The token that mentions a given display name. */
export function waMentionToken(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return `@${first}`;
}

/** Tokens that address the whole group rather than one person. */
export const WA_MENTION_EVERYONE = ["@all", "@everyone", "@todos"];

/** Every `@word` in a body, lowercased, without the `@`. */
export function mentionTokensIn(body: string): string[] {
  const out: string[] = [];
  // Unicode-aware: "@José" and "@Ana" have to match as readily as "@Bob".
  for (const match of body.matchAll(/@([\p{L}\p{N}_-]{1,40})/gu)) {
    out.push(match[1].toLowerCase());
  }
  return out;
}

export type MentionCandidate = { id: string; name: string };

/**
 * Which participants a body mentions.
 *
 * `@all` / `@everyone` / `@todos` resolve to every candidate, matching the
 * broadcast mentions WhatsApp offers group admins. The caller is responsible for
 * excluding the sender — you can't mention yourself into your own badge.
 */
export function resolveMentions(
  body: string,
  candidates: MentionCandidate[],
): string[] {
  const tokens = new Set(mentionTokensIn(body));
  if (tokens.size === 0) return [];

  const everyone = WA_MENTION_EVERYONE.some((token) =>
    tokens.has(token.slice(1)),
  );
  if (everyone) return candidates.map((c) => c.id);

  const hits = new Set<string>();
  for (const candidate of candidates) {
    const token = waMentionToken(candidate.name).slice(1).toLowerCase();
    if (token && tokens.has(token)) hits.add(candidate.id);
  }
  return [...hits];
}

/**
 * Split a body into plain and mention runs, for highlighting.
 *
 * Only tokens that actually resolved to a participant are highlighted — an
 * `@` in an email address or a stray "@here" in a 1:1 chat stays plain text.
 */
export type BodySegment = { text: string; mention: boolean };

export function segmentMentions(
  body: string,
  mentionedTokens: Set<string>,
): BodySegment[] {
  if (mentionedTokens.size === 0) return [{ text: body, mention: false }];

  const out: BodySegment[] = [];
  let last = 0;
  for (const match of body.matchAll(/@([\p{L}\p{N}_-]{1,40})/gu)) {
    const start = match.index ?? 0;
    if (!mentionedTokens.has(match[1].toLowerCase())) continue;
    if (start > last) out.push({ text: body.slice(last, start), mention: false });
    out.push({ text: match[0], mention: true });
    last = start + match[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last), mention: false });
  return out.length > 0 ? out : [{ text: body, mention: false }];
}
