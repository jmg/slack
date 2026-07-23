import "server-only";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/session";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Read + verify the session from the request cookies. */
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

/** Return the full authenticated user, or null. */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  // The token carries the tokenVersion it was issued at; if the user has since
  // bumped it (logout, password change, forced sign-out) the token is dead.
  // This is what makes an otherwise-stateless JWT revocable. A deactivated
  // (deleted) account can never authenticate again.
  if (!user || user.deactivatedAt || user.tokenVersion !== session.tokenVersion) {
    return null;
  }
  return user;
}

/** Issue a session cookie for the given user. */
export async function createSession(user: {
  id: string;
  email: string;
  tokenVersion: number;
}) {
  const token = await signSession({
    userId: user.id,
    email: user.email,
    tokenVersion: user.tokenVersion,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions);
}

/** Invalidate every outstanding session for a user by advancing tokenVersion. */
export async function revokeUserSessions(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
