import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { createWaSession, hashWaPassword } from "@/lib/wpp/auth";
import { waRegisterSchema } from "@/lib/wpp/validators";
import { resolveWppLocale, WPP_LOCALE_COOKIE } from "@/lib/wpp/i18n";

export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);

    // Throttle per-IP to blunt mass account creation and phone-number probing.
    const limited = rateLimit(`wpp:register:ip:${clientIp(req)}`, 10, 60 * 60 * 1000);
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "auth.tooManyAttempts" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
      );
    }

    const parsed = waRegisterSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "validate.invalidInput");
    }
    const { name, phone, password } = parsed.data;

    const existing = await prisma.waUser.findUnique({ where: { phone } });
    if (existing) return apiError("auth.phoneTaken", 409);

    // Seed the account's language from what the browser asked for, so the very
    // first screen after sign-up is already in the right one.
    const locale = resolveWppLocale({
      cookie: req.cookies.get(WPP_LOCALE_COOKIE)?.value,
      acceptLanguage: req.headers.get("accept-language"),
    });

    const user = await prisma.waUser.create({
      data: {
        name,
        phone,
        locale,
        passwordHash: await hashWaPassword(password),
        lastSeenAt: new Date(),
      },
    });

    await createWaSession(user);
    recordAudit({ action: "wpp.auth.register", actorId: user.id });

    return NextResponse.json({ id: user.id, name: user.name, phone: user.phone });
  });
}
