/**
 * What our emails may carry from text people typed, and how many invitation
 * emails a workspace may send.
 *
 * Anyone can sign up (no email check), name themselves and their workspace
 * anything, and type any address into "Invite by email". That made the invite
 * an open relay from our domain and our SendGrid account: in October 2026 a
 * Shopify app of the network was used exactly like that (a free account, a
 * phishing text in a name field, a recipient changed before every send; 34,102
 * emails), and one abused app can get the shared SendGrid account suspended.
 * So:
 *
 * - Names that land in our emails (the inviter's, the workspace's, the
 *   reader's own) go out as plain text without links or web addresses
 *   (plainName), and a new name with HTML or a link is refused on save
 *   (nameError).
 * - A workspace can email a limited number of invitations a day, a person a
 *   limited number across their workspaces, the same address once a day, and
 *   free workspaces together a fixed number a day (inviteEmailLimit). Past a
 *   limit the person is still added / the invite link still works: we just
 *   don't email, and the inviter shares the link.
 * - Every email that carries someone's name says who made us send it and where
 *   to report it (inviteFooter).
 *
 * Dependency-free on purpose: the notify-emails cron (plain tsx, no path
 * aliases) imports it too.
 */

/** Where people report an email they didn't expect. */
export const ABUSE_EMAIL = "sales@devcloudsoftware.com";

/** Longest name we put in an email (subjects included). */
export const EMAIL_NAME_MAX = 50;

/** Invitation emails per rolling 24 hours. */
export const INVITE_EMAIL_LIMITS = {
  /** From one free workspace (the Free plan holds 10 members). */
  freeWorkspace: 15,
  /** From one person, across every workspace, when inviting from a free one. */
  freeInviter: 25,
  /** From one Team (paid) workspace. */
  teamWorkspace: 200,
  /** From one person, inviting from a Team workspace. */
  teamInviter: 300,
  /** From every free workspace together: bounds what a crowd of throwaway
   *  accounts can send. Team workspaces don't count against it. */
  allFree: 200,
} as const;

export const INVITE_EMAIL_WINDOW_MS = 24 * 60 * 60 * 1000;

const TAG = /<\s*\/?\s*[a-zA-Z!][^>]*>/g;
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const DOMAIN =
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}\b(?:\/[^\s<>"']*)?/gi;
const CONTROL = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

/**
 * A name someone typed, made safe to put in one of our emails: no HTML, no
 * links and no web addresses (mail clients turn a bare "example.com" into a
 * link), one line, at most EMAIL_NAME_MAX characters. `fallback` when nothing
 * is left.
 */
export function plainName(text: string | null | undefined, fallback: string): string {
  let s = (text ?? "").replace(TAG, " ").replace(CONTROL, " ");
  s = s.replace(LINK, " ").replace(DOMAIN, " ");
  // Leftover brackets would read as the start of a tag in a sloppy client.
  s = s.replace(/[<>]/g, " ").replace(/\s+/g, " ").trim();
  if (s.length > EMAIL_NAME_MAX) s = `${s.slice(0, EMAIL_NAME_MAX - 1).trimEnd()}…`;
  return s || fallback;
}

/** Why a person or workspace name can't be saved, or null. Bare domains stay
 *  allowed here ("Acme.io" is a real company name); emails drop them. */
export function nameError(text: string): string | null {
  TAG.lastIndex = 0;
  LINK.lastIndex = 0;
  if (TAG.test(text)) return "Names can't contain HTML";
  if (LINK.test(text)) return "Names can't contain links";
  return null;
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Invitation emails already sent in the last 24 hours. */
export type InviteEmailCounts = {
  /** From this workspace. */
  workspace: number;
  /** By this person, from any workspace. */
  inviter: number;
  /** To this same address, from this workspace. */
  sameAddress: number;
  /** From every workspace together. */
  all: number;
};

/**
 * Why we won't email this invitation, or null when we may. The message is
 * shown to the inviter, who can still share the invite link themselves.
 */
export function inviteEmailLimit(
  counts: InviteEmailCounts,
  plan: "free" | "team",
): string | null {
  const L = INVITE_EMAIL_LIMITS;
  if (counts.sameAddress > 0) {
    return "We already emailed them an invitation from this workspace today.";
  }
  const perWorkspace = plan === "team" ? L.teamWorkspace : L.freeWorkspace;
  const perInviter = plan === "team" ? L.teamInviter : L.freeInviter;
  if (counts.workspace >= perWorkspace) {
    return `This workspace has sent ${perWorkspace} invitation emails today, the daily limit.`;
  }
  if (counts.inviter >= perInviter) {
    return `You've sent ${perInviter} invitation emails today, the daily limit.`;
  }
  if (plan === "free" && counts.all >= L.allFree) {
    return "We can't send more invitation emails today.";
  }
  return null;
}

/** The lines that close an invitation email: who made us send it, what
 *  happens if they ignore it, and where to report it. */
export function inviteFooter(inviter: string, brand: string): { text: string; html: string } {
  const text =
    `You got this email because ${inviter} entered your address in ${brand}. ` +
    `Not expecting it? Ignore it: nothing happens unless you open the link. ` +
    `To report it, forward it to ${ABUSE_EMAIL}.`;
  const html =
    `<p style="font-size:12px;line-height:1.5;color:#8b8a8b;margin:24px 0 0">` +
    `You got this email because <strong>${escapeHtml(inviter)}</strong> entered your address in ${escapeHtml(brand)}. ` +
    `Not expecting it? Ignore it: nothing happens unless you open the link. ` +
    `To report it, forward it to ${escapeHtml(ABUSE_EMAIL)}.</p>`;
  return { text, html };
}
