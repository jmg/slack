import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { dummyPasswordHash } from "@/lib/password";
import { createWaSession, verifyWaPassword } from "@/lib/wpp/auth";
import { waLoginSchema } from "@/lib/wpp/validators";

const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);

    const parsed = waLoginSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "validate.invalidInput");
    }
    const { phone, password } = parsed.data;

    // Throttle credential stuffing per-account and per-IP.
    const byAccount = rateLimit(`wpp:login:phone:${phone}`, 8, WINDOW_MS);
    const byIp = rateLimit(`wpp:login:ip:${clientIp(req)}`, 30, WINDOW_MS);
    if (!byAccount.allowed || !byIp.allowed) {
      return NextResponse.json(
        { error: "auth.tooManyAttempts" },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.max(byAccount.retryAfter, byIp.retryAfter)),
          },
        },
      );
    }

    // Resolved together so the miss path never pays for the dummy hash on top
    // of its compare — see dummyPasswordHash().
    const [user, dummyHash] = await Promise.all([
      prisma.waUser.findUnique({ where: { phone } }),
      dummyPasswordHash(),
    ]);
    // Exactly one compare on every path (real hash or dummy) keeps timing flat.
    const ok = await verifyWaPassword(password, user?.passwordHash ?? dummyHash);
    if (!user || !ok || user.deactivatedAt) {
      return apiError("auth.invalidCredentials", 401);
    }

    await prisma.waUser.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });
    await createWaSession(user);
    recordAudit({ action: "wpp.auth.login", actorId: user.id });

    return NextResponse.json({
      id: user.id,
      name: user.name,
      phone: user.phone,
      locale: user.locale,
    });
  });
}
