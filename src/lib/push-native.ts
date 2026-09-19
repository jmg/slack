import "server-only";
import { createSign } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { PushPayload } from "@/lib/push";

// Firebase Cloud Messaging (HTTP v1): the Android app's half of push.ts.
//
// Web Push cannot reach the app. The shell is a WebView over the live site and
// a WebView has no Push API, so a phone can never hold a PushSubscription — it
// registers an FCM token (POST /api/devices) and this delivers there.
//
// Auth is a service-account JWT signed with node:crypto rather than pulling in
// googleapis for a single call. FCM_SERVICE_ACCOUNT is the JSON key from the
// Firebase console, on one line. Unset — the default anywhere but production —
// every function here is a no-op that never touches the database.

/** The channel the app creates; Android drops notifications for unknown ones. */
const CHANNEL = "messages";

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

function serviceAccount(): ServiceAccount | null {
  const raw = (process.env.FCM_SERVICE_ACCOUNT || "").trim();
  if (!raw) return null;
  try {
    const sa = JSON.parse(raw) as ServiceAccount;
    return sa.project_id && sa.client_email && sa.private_key ? sa : null;
  } catch {
    // A malformed value in the environment must not take the app down with it.
    return null;
  }
}

export function nativePushConfigured(): boolean {
  return serviceAccount() !== null;
}

// Access tokens last an hour: keep the live one instead of doing the JWT
// exchange on every message.
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string | null> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  // Depending on how the variable was set, the PEM may arrive with escaped
  // newlines; this signs in both cases.
  const signature = signer.sign(sa.private_key.replace(/\\n/g, "\n"), "base64url");

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${header}.${claims}.${signature}`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;
    cached = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
    return cached.token;
  } catch {
    return null;
  }
}

type FcmError = { error?: { details?: { errorCode?: string }[] } };

/** Deliver to every Android phone of a user, pruning tokens FCM reports gone. */
export async function sendNativePushToUser(userId: string, payload: PushPayload): Promise<void> {
  const sa = serviceAccount();
  if (!sa) return;

  try {
    const devices = await prisma.deviceToken.findMany({
      where: { userId },
      select: { id: true, token: true },
    });
    if (devices.length === 0) return;

    const bearer = await accessToken(sa);
    if (!bearer) return;

    const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
    const dead: string[] = [];

    await Promise.all(
      devices.map(async (device) => {
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
            body: JSON.stringify({
              message: {
                token: device.token,
                notification: { title: payload.title, body: payload.body },
                // In data rather than as a click action: the app navigates
                // in-process instead of reloading the WebView and losing state.
                data: { link: payload.url },
                android: {
                  priority: "HIGH",
                  // A day, like the web channel: a message from last week is
                  // not worth a buzz, and the app shows it anyway.
                  ttl: "86400s",
                  notification: { channel_id: CHANNEL },
                },
              },
            }),
            signal: AbortSignal.timeout(15_000),
          });
          if (res.ok) return;
          // Only prune what FCM calls gone. A 400 can equally be a message
          // malformed on our side, and deleting tokens over our own bug would
          // silently unregister every phone.
          const err = (await res.json().catch(() => null)) as FcmError | null;
          const gone =
            res.status === 404 ||
            !!err?.error?.details?.some((d) => d.errorCode === "UNREGISTERED");
          if (gone) dead.push(device.id);
          else console.error("push: fcm send failed", res.status);
        } catch {
          // Transient (timeout, network): the next message tries again.
        }
      }),
    );

    if (dead.length > 0) {
      await prisma.deviceToken.deleteMany({ where: { id: { in: dead } } }).catch(() => {});
    }
  } catch (err) {
    console.error("push: fcm failed", (err as Error).message);
  }
}
