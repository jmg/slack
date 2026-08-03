import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { requireWaUser } from "@/lib/wpp/api";
import {
  createWaSession,
  hashWaPassword,
  verifyWaPassword,
} from "@/lib/wpp/auth";
import { waChangePasswordSchema } from "@/lib/wpp/validators";

/**
 * Change the account password.
 *
 * Bumping `tokenVersion` signs every *other* device out — the point of changing
 * a password is that whoever else had it stops being logged in. The caller then
 * gets a freshly minted cookie so their own tab survives.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();

    const limited = rateLimit(
      `wpp:password:${me.id}:${clientIp(req)}`,
      6,
      15 * 60 * 1000,
    );
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "auth.tooManyAttempts" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
      );
    }

    const parsed = waChangePasswordSchema.safeParse(
      await req.json().catch(() => null),
    );
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "validate.invalidInput");
    }

    const ok = await verifyWaPassword(parsed.data.currentPassword, me.passwordHash);
    if (!ok) return apiError("settings.passwordWrong", 400);

    const updated = await prisma.waUser.update({
      where: { id: me.id },
      data: {
        passwordHash: await hashWaPassword(parsed.data.newPassword),
        tokenVersion: { increment: 1 },
      },
    });

    await createWaSession(updated);
    recordAudit({ action: "wpp.account.password", actorId: me.id });

    return NextResponse.json({ ok: true });
  });
}
