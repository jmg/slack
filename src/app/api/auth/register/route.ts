import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, hashPassword } from "@/lib/auth";
import { registerSchema } from "@/lib/validators";
import { apiError, handle } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  return handle(async () => {
    // Throttle signups per-IP to blunt mass account creation / email probing.
    const limited = rateLimit(`register:ip:${clientIp(req)}`, 10, 60 * 60 * 1000);
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = registerSchema.safeParse(json);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { name, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return apiError("An account with that email already exists", 409);
    }

    const user = await prisma.user.create({
      data: { name, email, passwordHash: await hashPassword(password) },
    });
    await createSession(user);

    return NextResponse.json({ id: user.id, name: user.name, email: user.email });
  });
}
