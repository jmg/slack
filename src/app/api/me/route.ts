import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { destroySession, hashPassword } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/csrf";
import { recordAudit } from "@/lib/audit";
import { isChatTheme } from "@/lib/themes";

// Avatars are stored inline as a small (client-resized) data URL — no object
// storage or public proxy needed, and every member payload already carries it.
const avatarImage = z
  .string()
  .refine(
    (v) => /^data:image\/(png|jpe?g|webp);base64,/.test(v) && v.length <= 400_000,
    "Invalid image",
  );

const updateSchema = z
  .object({
    emailNotifications: z.boolean().optional(),
    chatTheme: z.string().refine(isChatTheme, "Unknown theme").optional(),
    image: z.union([avatarImage, z.null()]).optional(),
  })
  .refine(
    (d) =>
      d.emailNotifications !== undefined ||
      d.chatTheme !== undefined ||
      d.image !== undefined,
    { message: "Nothing to update" },
  );

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
    assertSameOrigin(req);
    const user = await requireUser();
    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { emailNotifications, chatTheme, image } = parsed.data;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(image !== undefined ? { image } : {}),
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

/**
 * Delete (GDPR-erase) the current account. Rather than a hard delete — which
 * would cascade away this user's messages and break threads other people are in
 * — we scrub the PII, drop all memberships, and mark the account deactivated so
 * it can never sign in again. Messages remain, attributed to a "Deleted user".
 */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();

    // Don't strand a workspace with no admin: for every workspace this user
    // solely administers, promote the oldest remaining member before we drop
    // their membership. (The members route's last-admin guard doesn't cover
    // account deletion, so this is where we keep the invariant.)
    const adminOf = await prisma.workspaceMember.findMany({
      where: { userId: user.id, role: "ADMIN" },
      select: { workspaceId: true },
    });
    for (const { workspaceId } of adminOf) {
      const otherAdmins = await prisma.workspaceMember.count({
        where: { workspaceId, role: "ADMIN", userId: { not: user.id } },
      });
      if (otherAdmins > 0) continue;
      const successor = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: { not: user.id } },
        orderBy: { createdAt: "asc" },
        select: { id: true, userId: true },
      });
      if (successor) {
        await prisma.workspaceMember.update({
          where: { id: successor.id },
          data: { role: "ADMIN" },
        });
        recordAudit({
          action: "workspace.role_promote",
          actorId: user.id,
          workspaceId,
          targetType: "user",
          targetId: successor.userId,
        });
      }
    }

    const scrubbedHash = await hashPassword(randomBytes(32).toString("hex"));

    await prisma.$transaction([
      prisma.workspaceMember.deleteMany({ where: { userId: user.id } }),
      prisma.channelMember.deleteMany({ where: { userId: user.id } }),
      prisma.conversationMember.deleteMany({ where: { userId: user.id } }),
      prisma.star.deleteMany({ where: { userId: user.id } }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          name: "Deleted user",
          email: `deleted-${user.id}@deleted.invalid`,
          passwordHash: scrubbedHash,
          image: null,
          emailNotifications: false,
          deactivatedAt: new Date(),
          // Kill every outstanding session for this user.
          tokenVersion: { increment: 1 },
        },
      }),
    ]);

    recordAudit({ action: "account.delete", actorId: user.id });
    await destroySession();
    return NextResponse.json({ ok: true });
  });
}
