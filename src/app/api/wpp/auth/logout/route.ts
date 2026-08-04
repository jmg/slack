import { NextRequest, NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { recordAudit } from "@/lib/audit";
import {
  destroyWaSession,
  getWaSession,
  revokeWaSessions,
} from "@/lib/wpp/auth";

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const session = await getWaSession();

    // Clearing the cookie only stops *this* browser from presenting the token.
    // Bumping tokenVersion is what actually kills it, so a copy grabbed from
    // another device dies too.
    if (session) {
      await revokeWaSessions(session.userId).catch(() => {});
      recordAudit({ action: "wpp.auth.logout", actorId: session.userId });
    }
    await destroyWaSession();

    return NextResponse.json({ ok: true });
  });
}
