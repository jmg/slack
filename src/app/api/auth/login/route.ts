import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, verifyPassword } from "@/lib/auth";
import { loginSchema } from "@/lib/validators";
import { apiError, handle } from "@/lib/api";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const json = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(json);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return apiError("Invalid email or password", 401);
    }

    await createSession(user);
    return NextResponse.json({ id: user.id, name: user.name, email: user.email });
  });
}
