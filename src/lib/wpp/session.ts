import { SignJWT, jwtVerify } from "jose";

/**
 * Edge-safe session helpers for the WhatsApp clone — the mirror of
 * `src/lib/session.ts`, and like it, depends only on `jose` so `src/proxy.ts`
 * can import it on the Edge runtime.
 *
 * ## Why a derived key, not AUTH_SECRET itself
 * Both apps live in one deploy and share `AUTH_SECRET`. If both signed HS256
 * with the raw secret, a token minted for one app would verify in the other —
 * and since both payloads carry a `userId`, a WhatsApp token could stand in for
 * a Slack session (and vice-versa) the moment two ids ever collided. Deriving a
 * per-app key with SHA-256 makes the two token families cryptographically
 * unrelated, in both directions, without touching the Slack half. `aud`/`iss`
 * are belt-and-braces on top.
 */

export const WPP_SESSION_COOKIE = "wpp_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const ISSUER = "talkaroo";
const AUDIENCE = "talkaroo-wpp";
const KEY_INFO = "|talkaroo-wpp-session-v1";

export type WppSessionPayload = {
  userId: string;
  phone: string;
  /** Snapshot of WaUser.tokenVersion at issue time — see getCurrentWaUser. */
  tokenVersion: number;
};

let cachedKey: Promise<Uint8Array> | null = null;

async function getKey(): Promise<Uint8Array> {
  const pending = (cachedKey ??= (async () => {
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      throw new Error("AUTH_SECRET is not set. Copy .env.example to .env.");
    }
    // Short secrets make HS256 cheap to brute-force offline. Fail closed in
    // production, stay lenient in dev — same policy as the Slack half.
    if (secret.length < 32 && process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be at least 32 characters in production.");
    }
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${secret}${KEY_INFO}`),
    );
    return new Uint8Array(digest);
  })());

  try {
    return await pending;
  } catch (err) {
    // Don't cache the rejection — a misconfigured env should surface the same
    // error on every request, not a stale unhandled promise.
    cachedKey = null;
    throw err;
  }
}

export async function signWppSession(
  payload: WppSessionPayload,
): Promise<string> {
  return new SignJWT({
    userId: payload.userId,
    phone: payload.phone,
    tokenVersion: payload.tokenVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime("30d")
    .sign(await getKey());
}

export async function verifyWppSessionToken(
  token: string | undefined | null,
): Promise<WppSessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await getKey(), {
      // Pin the algorithm so a token can't downgrade to alg:none.
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (
      typeof payload.userId !== "string" ||
      typeof payload.phone !== "string" ||
      typeof payload.tokenVersion !== "number"
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      phone: payload.phone,
      tokenVersion: payload.tokenVersion,
    };
  } catch {
    return null;
  }
}

export const wppSessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
