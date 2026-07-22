import { NextResponse } from "next/server";
import { destroySession, getSession, revokeUserSessions } from "@/lib/auth";

export async function POST() {
  // Bump tokenVersion so the just-cleared cookie (and any other session for this
  // user) can't be replayed even if it was captured — logout is a real revoke,
  // not just a client-side cookie delete.
  const session = await getSession();
  if (session) await revokeUserSessions(session.userId);
  await destroySession();
  return NextResponse.json({ ok: true });
}
