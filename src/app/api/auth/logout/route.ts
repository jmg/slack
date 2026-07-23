import { NextRequest, NextResponse } from "next/server";
import { destroySession, getSession, revokeUserSessions } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/csrf";
import { apiError, ApiError } from "@/lib/api";
import { recordAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
  } catch (err) {
    if (err instanceof ApiError) return apiError(err.message, err.status);
    throw err;
  }
  // Bump tokenVersion so the just-cleared cookie (and any other session for this
  // user) can't be replayed even if it was captured — logout is a real revoke,
  // not just a client-side cookie delete.
  const session = await getSession();
  if (session) {
    await revokeUserSessions(session.userId);
    recordAudit({ action: "auth.logout", actorId: session.userId });
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
