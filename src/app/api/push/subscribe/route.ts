import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";

/** Register (or refresh) a Web Push subscription for the current user. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;
    if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
      return apiError("Invalid subscription");
    }
    // Upsert on endpoint: the same browser re-subscribing updates in place, and a
    // subscription is (re)claimed by whoever is signed in on this device.
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId: user.id, endpoint, p256dh, auth },
      update: { userId: user.id, p256dh, auth },
    });
    return NextResponse.json({ ok: true });
  });
}

/** Remove a subscription (this endpoint, or all of the user's). */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const endpoint = new URL(req.url).searchParams.get("endpoint");
    await prisma.pushSubscription.deleteMany({
      where: endpoint ? { userId: user.id, endpoint } : { userId: user.id },
    });
    return NextResponse.json({ ok: true });
  });
}
