import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, verifyPassword } from "@/lib/auth";
import { loginSchema } from "@/lib/validators";
import { apiError, handle } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/csrf";
import { recordAudit } from "@/lib/audit";
import { dummyPasswordHash } from "@/lib/password";

const WINDOW_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const json = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(json);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { email, password } = parsed.data;

    // Throttle brute-force / credential-stuffing, per-account and per-IP.
    const ip = clientIp(req);
    const byAccount = rateLimit(`login:acct:${email}`, 8, WINDOW_MS);
    const byIp = rateLimit(`login:ip:${ip}`, 30, WINDOW_MS);
    if (!byAccount.allowed || !byIp.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again in a few minutes." },
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
      prisma.user.findUnique({ where: { email } }),
      dummyPasswordHash(),
    ]);
    // Always run exactly one compare (real hash or dummy) so timing is uniform.
    const ok = await verifyPassword(password, user?.passwordHash ?? dummyHash);
    if (!user || !ok) {
      return apiError("Invalid email or password", 401);
    }

    await createSession(user);
    recordAudit({ action: "auth.login", actorId: user.id });
    return NextResponse.json({ id: user.id, name: user.name, email: user.email });
  });
}
