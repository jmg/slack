import { NextResponse } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { pushConfigured, vapidPublicKey } from "@/lib/push";

/** The public VAPID key the browser needs to create a push subscription. */
export async function GET() {
  return handle(async () => {
    await requireUser();
    return NextResponse.json({ key: vapidPublicKey() ?? null, configured: pushConfigured() });
  });
}
