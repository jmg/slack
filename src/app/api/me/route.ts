import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";

const updateSchema = z.object({ emailNotifications: z.boolean() });

/** Current user's own settings. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      emailNotifications: user.emailNotifications,
    });
  });
}

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("Invalid input");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailNotifications: parsed.data.emailNotifications,
        // Start the dedupe cursor "now" when enabling, so we don't email a
        // backlog of old-but-unread messages the moment the toggle flips on.
        ...(parsed.data.emailNotifications ? { lastNotifiedAt: new Date() } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  });
}
