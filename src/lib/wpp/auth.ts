import "server-only";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  WPP_SESSION_COOKIE,
  signWppSession,
  verifyWppSessionToken,
  wppSessionCookieOptions,
  type WppSessionPayload,
} from "@/lib/wpp/session";
import { isWppLocale } from "@/lib/wpp/i18n";
import { isWppTheme } from "@/lib/wpp/config";
import type { WaMe } from "@/lib/wpp/types";

/**
 * Server-side auth for the WhatsApp clone. Mirrors `src/lib/auth.ts` but for
 * `WaUser` and the `wpp_session` cookie — the two apps never share a session.
 *
 * `server-only`: pulls in bcrypt, Prisma and next/headers, none of which can run
 * on the Edge. The proxy uses `lib/wpp/session.ts` instead.
 */

export async function hashWaPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyWaPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function getWaSession(): Promise<WppSessionPayload | null> {
  const store = await cookies();
  return verifyWppSessionToken(store.get(WPP_SESSION_COOKIE)?.value);
}

/**
 * The signed-in WhatsApp user, or null.
 *
 * The token carries the `tokenVersion` it was issued at; bumping the column
 * (logout, password change) kills every outstanding token, which is what makes
 * an otherwise-stateless JWT revocable. A deleted account never authenticates
 * again.
 */
export async function getCurrentWaUser() {
  const session = await getWaSession();
  if (!session) return null;
  const user = await prisma.waUser.findUnique({ where: { id: session.userId } });
  if (!user || user.deactivatedAt || user.tokenVersion !== session.tokenVersion) {
    return null;
  }
  return user;
}

export async function createWaSession(user: {
  id: string;
  phone: string;
  tokenVersion: number;
}) {
  const token = await signWppSession({
    userId: user.id,
    phone: user.phone,
    tokenVersion: user.tokenVersion,
  });
  const store = await cookies();
  store.set(WPP_SESSION_COOKIE, token, wppSessionCookieOptions);
}

/** Invalidate every outstanding session for a user. */
export async function revokeWaSessions(userId: string) {
  await prisma.waUser.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}

export async function destroyWaSession() {
  const store = await cookies();
  store.delete(WPP_SESSION_COOKIE);
}

type WaUserRow = NonNullable<Awaited<ReturnType<typeof getCurrentWaUser>>>;

/**
 * The signed-in account as the client sees it. Note what is *not* here:
 * `passwordHash`, `tokenVersion` and `deactivatedAt` never leave the server.
 */
export function serializeMe(user: WaUserRow): WaMe {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    about: user.about,
    avatarUrl: user.avatarUrl,
    locale: (isWppLocale(user.locale) ? user.locale : "en") as WaMe["locale"],
    theme: (isWppTheme(user.theme) ? user.theme : "system") as WaMe["theme"],
    wallpaper: user.wallpaper,
    lastSeenPrivacy: user.lastSeenPrivacy,
    avatarPrivacy: user.avatarPrivacy,
    aboutPrivacy: user.aboutPrivacy,
    readReceipts: user.readReceipts,
  };
}
