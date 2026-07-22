import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { isChatTheme } from "@/lib/themes";

const updateSchema = z
  .object({
    emailNotifications: z.boolean().optional(),
    chatTheme: z.string().refine(isChatTheme, "Unknown theme").optional(),
  })
  .refine((d) => d.emailNotifications !== undefined || d.chatTheme !== undefined, {
    message: "Nothing to update",
  });

/** Current user's own settings. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      emailNotifications: user.emailNotifications,
      chatTheme: user.chatTheme,
    });
  });
}

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { emailNotifications, chatTheme } = parsed.data;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(chatTheme !== undefined ? { chatTheme } : {}),
        ...(emailNotifications !== undefined
          ? {
              emailNotifications,
              // Start the dedupe cursor "now" when enabling, so we don't email a
              // backlog of old-but-unread messages the moment the toggle flips.
              ...(emailNotifications ? { lastNotifiedAt: new Date() } : {}),
            }
          : {}),
      },
    });
    return NextResponse.json({ ok: true });
  });
}
