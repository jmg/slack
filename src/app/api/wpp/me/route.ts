import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ApiError, apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { recordAudit } from "@/lib/audit";
import { requireWaUser } from "@/lib/wpp/api";
import { serializeMe } from "@/lib/wpp/auth";
import { waDeleteAccountSchema, waProfileSchema, waSettingsSchema } from "@/lib/wpp/validators";
import { WPP_LOCALE_COOKIE, isWppLocale } from "@/lib/wpp/i18n";
import { WPP_SESSION_COOKIE } from "@/lib/wpp/session";
import {
  attachmentIdFromUrl,
  deleteWaAttachment,
  waFileUrl,
} from "@/lib/wpp/uploads";
import { broadcastContacts } from "@/lib/wpp/realtime";
import { ensureGroupHasAdmin } from "@/lib/wpp/data";

/** The signed-in account: profile, preferences and privacy settings. */
export async function GET() {
  return handle(async () => {
    const me = await requireWaUser();
    return NextResponse.json(serializeMe(me));
  });
}

/**
 * Update profile (name, about, photo) and/or settings (language, theme,
 * wallpaper, privacy). One endpoint because the client's settings screen edits
 * both halves and there is no reason to make it send two requests.
 */
export async function PATCH(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const json = await req.json().catch(() => null);

    const profile = waProfileSchema.safeParse(json);
    const settings = waSettingsSchema.safeParse(json);
    if (!profile.success) {
      return apiError(profile.error.issues[0]?.message ?? "validate.invalidInput");
    }
    if (!settings.success) {
      return apiError(settings.error.issues[0]?.message ?? "validate.invalidInput");
    }

    const data: Record<string, unknown> = {};
    if (profile.data.name !== undefined) data.name = profile.data.name;
    if (profile.data.about !== undefined) data.about = profile.data.about;
    for (const [key, value] of Object.entries(settings.data)) {
      if (value !== undefined) data[key] = value;
    }

    // Swapping the photo: claim the pending upload, then bin the old object so
    // replaced avatars don't accumulate in the bucket.
    let staleAttachmentId: string | null = null;
    if (profile.data.avatarAttachmentId !== undefined) {
      staleAttachmentId = attachmentIdFromUrl(me.avatarUrl);

      if (profile.data.avatarAttachmentId === null) {
        data.avatarUrl = null;
      } else {
        const claimed = await prisma.waAttachment.updateMany({
          where: {
            id: profile.data.avatarAttachmentId,
            uploaderId: me.id,
            purpose: "AVATAR",
            messageId: null,
          },
          data: { chatId: null },
        });
        if (claimed.count !== 1) {
          throw new ApiError("error.attachmentsUnavailable", 400);
        }
        data.avatarUrl = waFileUrl(profile.data.avatarAttachmentId);
      }
    }

    // The availability check in Settings is advisory — two people can pass it
    // for the same handle at the same instant. The unique index is the real
    // arbiter, so its violation has to come back as a sentence rather than a
    // 500. P2002 is Prisma's unique-constraint code.
    let updated;
    try {
      updated = await prisma.waUser.update({ where: { id: me.id }, data });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "P2002" && data.username !== undefined) {
        throw new ApiError("username.errTaken", 409);
      }
      throw err;
    }

    if (staleAttachmentId && staleAttachmentId !== profile.data.avatarAttachmentId) {
      await deleteWaAttachment(staleAttachmentId);
    }

    // Keep the cookie in step so the signed-out pages (login, invites) render in
    // the language the account just chose.
    if (settings.data.locale && isWppLocale(settings.data.locale)) {
      const store = await cookies();
      store.set(WPP_LOCALE_COOKIE, settings.data.locale, {
        path: "/",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    // Name, photo and privacy changes are visible to the people you chat with.
    if (
      data.name !== undefined ||
      data.avatarUrl !== undefined ||
      data.about !== undefined ||
      data.avatarPrivacy !== undefined ||
      data.aboutPrivacy !== undefined ||
      data.lastSeenPrivacy !== undefined ||
      data.readReceipts !== undefined
    ) {
      // One query for the whole audience. The obvious shape — walk my chats,
      // then fetch each one's members — is a settings save that fires up to 200
      // sequential round trips.
      const peers = await prisma.waChatMember.findMany({
        where: {
          leftAt: null,
          chat: { members: { some: { userId: me.id, leftAt: null } } },
        },
        select: { userId: true },
        take: 2000,
      });
      await broadcastContacts([...new Set(peers.map((p) => p.userId))]);
    }

    return NextResponse.json(serializeMe(updated));
  });
}

/**
 * Delete the account.
 *
 * Scrubs the PII and marks the row deactivated rather than deleting it: the
 * messages this person sent stay in everyone else's chats (deleting them would
 * silently rewrite other people's conversations), just with no name, number or
 * photo attached. Same reasoning as the Slack half's GDPR deletion.
 */
export async function DELETE(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();

    const parsed = waDeleteAccountSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success || parsed.data.phone !== me.phone) {
      return apiError("validate.phoneInvalid", 400);
    }

    const avatarId = attachmentIdFromUrl(me.avatarUrl);

    // Groups this account administers have to survive it. Captured before the
    // membership rows are marked as left, then handed over one by one — the
    // same succession leaving or deleting a chat runs, because "the last admin
    // deleted their account" strands a group just as thoroughly.
    const adminGroups = await prisma.waChatMember.findMany({
      where: { userId: me.id, leftAt: null, chat: { type: "GROUP" } },
      select: { chatId: true },
      take: 500,
    });

    await prisma.$transaction([
      // Status updates are ephemeral by nature — take them with the account.
      prisma.waStatus.deleteMany({ where: { userId: me.id } }),
      prisma.waContact.deleteMany({
        where: { OR: [{ ownerId: me.id }, { contactId: me.id }] },
      }),
      prisma.waBlock.deleteMany({
        where: { OR: [{ blockerId: me.id }, { blockedId: me.id }] },
      }),
      prisma.waChatMember.updateMany({
        where: { userId: me.id, leftAt: null },
        data: { leftAt: new Date() },
      }),
      prisma.waUser.update({
        where: { id: me.id },
        data: {
          deactivatedAt: new Date(),
          // The phone number has to stay unique but must not identify anyone;
          // a random placeholder frees the real number for re-registration.
          phone: `deleted:${me.id}`,
          name: "",
          about: "",
          avatarUrl: null,
          lastSeenAt: null,
          passwordHash: "",
          tokenVersion: { increment: 1 },
        },
      }),
    ]);

    for (const { chatId } of adminGroups) {
      await ensureGroupHasAdmin(chatId).catch((err) =>
        console.error("wpp: admin succession failed for", chatId, err),
      );
    }

    // tokenVersion was already bumped inside the transaction, which is what
    // kills every outstanding token — clearing the cookie is just tidiness.
    await deleteWaAttachment(avatarId);
    recordAudit({ action: "wpp.account.delete", actorId: me.id });

    const store = await cookies();
    store.delete(WPP_SESSION_COOKIE);

    return NextResponse.json({ ok: true });
  });
}
