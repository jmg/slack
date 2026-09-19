import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";

// The Android app's equivalent of /api/push/subscribe: a WebView has no Push
// API, so the phone registers an FCM token here instead of a subscription.
//
// The session cookie authenticates it — the shell loads the live site, so the
// WebView is on the real origin and carries it like any tab. That is also why
// assertSameOrigin passes: the WebView's Origin is https://talkaroo.app.

const MAX_TOKEN = 4096;

async function readToken(req: NextRequest): Promise<string | null> {
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  // FCM tokens are long opaque strings; bound it so a broken client cannot
  // write arbitrary blobs into the table.
  return token && token.length <= MAX_TOKEN ? token : null;
}

/** Register (or refresh) this phone's FCM token for the current user. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const token = await readToken(req);
    if (!token) return apiError("Invalid token");
    // Upsert on the token: it identifies the phone, not the person. Signing in
    // with another account on the same device reassigns the row, where a second
    // row would quietly send that phone both accounts' messages.
    await prisma.deviceToken.upsert({
      where: { token },
      create: { userId: user.id, token, platform: "android" },
      update: { userId: user.id, lastSeenAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  });
}

/** Unregister this phone (called on sign-out). */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const token = await readToken(req);
    if (!token) return apiError("Invalid token");
    // Scoped to the signed-in user: with someone else's token this would be a
    // button for silencing another person's phone.
    await prisma.deviceToken.deleteMany({ where: { token, userId: user.id } });
    return NextResponse.json({ ok: true });
  });
}
