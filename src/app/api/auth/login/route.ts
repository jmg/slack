import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, verifyPassword } from "@/lib/auth";
import { loginSchema } from "@/lib/validators";
import { apiError, handle } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/csrf";
import { recordAudit } from "@/lib/audit";

// A constant, valid bcrypt hash. When the account doesn't exist we still run a
// compare against this so the miss path costs ~the same as a hit — otherwise
// response timing reveals which emails are registered.
const DUMMY_HASH = "$2b$10$vq1BE/aRFCfsBRDVMbeUG.8DblfLLYm9uiCKi0ryjpCLUwPb.YLVO";

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

    const user = await prisma.user.findUnique({ where: { email } });
    // Always run exactly one compare (real hash or dummy) so timing is uniform.
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      return apiError("Invalid email or password", 401);
    }

    await createSession(user);
    recordAudit({ action: "auth.login", actorId: user.id });
    return NextResponse.json({ id: user.id, name: user.name, email: user.email });
  });
}
