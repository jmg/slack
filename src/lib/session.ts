import { SignJWT, jwtVerify } from "jose";

/**
 * Edge-safe session helpers. Only depend on `jose` so this module can be used
 * inside middleware (Edge runtime) as well as in Node route handlers.
 */

export const SESSION_COOKIE = "slack_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type SessionPayload = {
  userId: string;
  email: string;
  /** Snapshot of the user's tokenVersion at issue time; see getCurrentUser. */
  tokenVersion: number;
};

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is not set. Copy .env.example to .env.");
  }
  // A short secret makes HS256 tokens cheap to forge offline. Fail closed in
  // production; stay lenient in dev so a throwaway secret still works locally.
  if (secret.length < 32 && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be at least 32 characters in production.");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    userId: payload.userId,
    email: payload.email,
    tokenVersion: payload.tokenVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    // Pin the algorithm so a token can't downgrade to alg:none or confuse RS/HS.
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    if (typeof payload.userId !== "string" || typeof payload.email !== "string") {
      return null;
    }
    // Tokens minted before tokenVersion existed default to 0 (backward-compat).
    const tokenVersion =
      typeof payload.tokenVersion === "number" ? payload.tokenVersion : 0;
    return { userId: payload.userId, email: payload.email, tokenVersion };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
