import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { WPP_SESSION_COOKIE, verifyWppSessionToken } from "@/lib/wpp/session";
import { WPP_BASE_PATH } from "@/lib/wpp/config";

/**
 * Request gate for both apps in this repo.
 *
 * Next.js 16 renamed the `middleware` file convention to `proxy` (same runtime,
 * same semantics); shipping both files is a build error, so this single file
 * carries the Slack gate *and* the WhatsApp gate.
 *
 * Runs on the Edge runtime, so it may only import modules that are Edge-safe:
 * `src/lib/session.ts` and `src/lib/wpp/session.ts` (jose only) plus the
 * dependency-free `src/lib/wpp/config.ts`.
 */

// ── Slack half ──────────────────────────────────────────────────────────────
const SLACK_AUTH_PAGES = ["/login", "/register"];
const SLACK_PROTECTED_PREFIXES = ["/w", "/workspaces"];

// ── WhatsApp half ───────────────────────────────────────────────────────────
const WPP_LOGIN = `${WPP_BASE_PATH}/login`;
const WPP_AUTH_PAGES = [WPP_LOGIN, `${WPP_BASE_PATH}/register`];
/**
 * Reachable signed-out. The invite landing page has to be, or a group link sent
 * to someone without an account would dead-end at a redirect.
 */
const WPP_PUBLIC_PREFIXES = [
  ...WPP_AUTH_PAGES,
  `${WPP_BASE_PATH}/invite`,
  // `/wpp/u/<handle>` — the public profile behind an @username. Same reasoning
  // as the invite page: a link shared with someone who has no account yet has
  // to show them who it belongs to before asking them to sign up.
  `${WPP_BASE_PATH}/u`,
];

/**
 * Does this request belong to the WhatsApp subdomain?
 *
 * `wpp.talkaroo.app` works with no configuration; `WPP_HOST` (comma-separated)
 * adds explicit hosts for anyone serving it from a different name.
 */
function isWppHost(req: NextRequest): boolean {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (!host) return false;
  if (host.startsWith("wpp.")) return true;
  const configured = process.env.WPP_HOST;
  if (!configured) return false;
  return configured
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .includes(host);
}

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

async function gateWpp(req: NextRequest, pathname: string) {
  const session = await verifyWppSessionToken(
    req.cookies.get(WPP_SESSION_COOKIE)?.value,
  );

  if (!session && !matchesPrefix(pathname, WPP_PUBLIC_PREFIXES)) {
    const url = new URL(WPP_LOGIN, req.url);
    if (pathname !== WPP_BASE_PATH) {
      url.searchParams.set("next", pathname + req.nextUrl.search);
    }
    return NextResponse.redirect(url);
  }

  if (session && WPP_AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL(`${WPP_BASE_PATH}/chats`, req.url));
  }

  return NextResponse.next();
}

async function gateSlack(req: NextRequest, pathname: string) {
  const session = await verifySessionToken(
    req.cookies.get(SESSION_COOKIE)?.value,
  );

  if (!session && matchesPrefix(pathname, SLACK_PROTECTED_PREFIXES)) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (session && SLACK_AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL("/workspaces", req.url));
  }

  return NextResponse.next();
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The WhatsApp subdomain serves only the WhatsApp app, so fold every bare
  // path into the /wpp route tree. A redirect rather than a rewrite keeps one
  // canonical URL per page — the same link works on the subdomain and on
  // localhost:3000/wpp, so nothing has to know which host it is running on.
  // `/api/*` is excluded by the matcher below and reaches its handler intact.
  if (isWppHost(req) && !matchesPrefix(pathname, [WPP_BASE_PATH])) {
    const url = req.nextUrl.clone();
    url.pathname = pathname === "/" ? WPP_BASE_PATH : `${WPP_BASE_PATH}${pathname}`;
    return NextResponse.redirect(url);
  }

  return matchesPrefix(pathname, [WPP_BASE_PATH])
    ? gateWpp(req, pathname)
    : gateSlack(req, pathname);
}

export const config = {
  // Everything except API routes, Next internals and files with an extension.
  // Broader than the Slack app alone needs, because the host fold-in above has
  // to see any path that can land on the WhatsApp subdomain.
  //
  // `_next/` is excluded wholesale rather than just `_next/static` and
  // `_next/image`: on the WhatsApp subdomain the fold-in would rewrite an
  // extensionless internal path like `/_next/image` to `/wpp/_next/image` and
  // break every optimized asset on the page.
  matcher: ["/((?!api/|_next/|favicon.ico|.*\\..*).*)"],
};
