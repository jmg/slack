import { NextResponse } from "next/server";

// Liveness endpoint for the platform health check. Kept dependency-free so a
// slow/unavailable database never fails the release health check and causes a
// needless rollback.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, service: "slack" });
}
