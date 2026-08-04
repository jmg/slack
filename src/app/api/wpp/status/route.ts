import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requireWaUser } from "@/lib/wpp/api";
import { blockSetsFor, canSeeField, contactIdsOf, contactOfIds } from "@/lib/wpp/data";
import { loadContactMaps, type ContactMaps } from "@/lib/wpp/messages";
import {
  deleteWaAttachment,
  serializeWaAttachment,
  waAttachmentSelect,
} from "@/lib/wpp/uploads";
import { broadcastStatus } from "@/lib/wpp/realtime";
import { waStatusSchema } from "@/lib/wpp/validators";
import { STATUS_TTL_MS } from "@/lib/wpp/config";
import { attachmentKind } from "@/lib/wpp/upload-limits";
import type { WaStatusGroup, WaStatusItem } from "@/lib/wpp/types";
import type { WaStatusKind } from "@/generated/prisma/enums";

/**
 * Status updates ("Estados"): 24-hour posts, grouped by author.
 *
 * ## Who can see a status
 * One rule, applied everywhere in this file: **a status is visible to its
 * author and to the accounts in the author's address book.** Posting shares
 * with the people you saved, which is what WhatsApp's "My contacts" default
 * means, and it makes the audience computable without walking anyone's chats.
 * For the reader that inverts to "authors who have saved me" — `contactOfIds` —
 * minus anyone either of us has blocked.
 */

type StatusAttachment = Parameters<typeof serializeWaAttachment>[0];

type StatusRow = {
  id: string;
  kind: WaStatusKind;
  body: string;
  backgroundColor: string | null;
  createdAt: Date;
  expiresAt: Date;
  attachment: StatusAttachment | null;
};

function statusItem(
  row: StatusRow,
  opts: { seen: boolean; viewers: WaStatusItem["viewers"] },
): WaStatusItem {
  return {
    id: row.id,
    kind: row.kind,
    body: row.body,
    backgroundColor: row.backgroundColor,
    attachment: row.attachment ? serializeWaAttachment(row.attachment) : null,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    seen: opts.seen,
    viewers: opts.viewers,
  };
}

/** Name and photo of someone in the feed, as *this* viewer should see them. */
function personFor(
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
    avatarPrivacy: "EVERYONE" | "CONTACTS" | "NOBODY";
  },
  contacts: ContactMaps,
) {
  const showAvatar = canSeeField(user.avatarPrivacy, {
    isMe: false,
    // Judged from the subject's address book: they saved me, so I'm inside the
    // "my contacts" audience they chose.
    isContact: contacts.iAmTheirContact.has(user.id),
  });
  return {
    id: user.id,
    name: contacts.aliasById.get(user.id) ?? user.name,
    phone: null,
    avatarUrl: showAvatar ? user.avatarUrl : null,
  };
}

/** The status feed: the caller's own updates first, then their contacts'. */
export async function GET() {
  return handle(async () => {
    const me = await requireWaUser();
    const now = new Date();

    const [savedMeIds, blocks] = await Promise.all([
      contactOfIds(me.id),
      blockSetsFor(me.id),
    ]);
    const authorIds = [...savedMeIds].filter(
      (id) => id !== me.id && !blocks.iBlocked.has(id) && !blocks.blockedMe.has(id),
    );

    const [mine, theirs] = await Promise.all([
      prisma.waStatus.findMany({
        where: { userId: me.id, expiresAt: { gt: now } },
        orderBy: { createdAt: "asc" },
        include: {
          attachment: { select: waAttachmentSelect },
          // Viewer identities are loaded for your own updates and nowhere else —
          // who watched a contact's status is between them and their audience.
          views: {
            orderBy: { viewedAt: "desc" },
            take: 200,
            select: {
              viewedAt: true,
              viewer: {
                select: {
                  id: true,
                  name: true,
                  avatarUrl: true,
                  avatarPrivacy: true,
                },
              },
            },
          },
        },
      }),
      prisma.waStatus.findMany({
        where: { userId: { in: authorIds }, expiresAt: { gt: now } },
        orderBy: { createdAt: "asc" },
        include: {
          attachment: { select: waAttachmentSelect },
          // Existence only: has the caller seen this one?
          views: { where: { viewerId: me.id }, select: { id: true } },
          user: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              avatarPrivacy: true,
              deactivatedAt: true,
            },
          },
        },
        take: 500,
      }),
    ]);

    const contacts = await loadContactMaps(me.id, [
      ...authorIds,
      ...mine.flatMap((s) => s.views.map((v) => v.viewer.id)),
    ]);

    const groups: WaStatusGroup[] = [];

    if (mine.length > 0) {
      groups.push({
        user: {
          id: me.id,
          name: me.name,
          phone: me.phone,
          avatarUrl: me.avatarUrl,
        },
        isMe: true,
        items: mine.map((row) =>
          statusItem(row, {
            // You've obviously seen your own updates; the unseen ring is for
            // other people's.
            seen: true,
            viewers: row.views.map((v) => {
              const person = personFor(v.viewer, contacts);
              return {
                id: person.id,
                name: person.name,
                avatarUrl: person.avatarUrl,
                viewedAt: v.viewedAt.toISOString(),
              };
            }),
          }),
        ),
        hasUnseen: false,
        latestAt: mine[mine.length - 1]!.createdAt.toISOString(),
      });
    }

    const byAuthor = new Map<string, typeof theirs>();
    for (const row of theirs) {
      // A deleted account's updates go with it, even before the sweep runs.
      if (row.user.deactivatedAt) continue;
      const list = byAuthor.get(row.userId) ?? [];
      list.push(row);
      byAuthor.set(row.userId, list);
    }

    const others: WaStatusGroup[] = [];
    for (const rows of byAuthor.values()) {
      const items = rows.map((row) =>
        statusItem(row, { seen: row.views.length > 0, viewers: [] }),
      );
      others.push({
        user: personFor(rows[0]!.user, contacts),
        isMe: false,
        items,
        hasUnseen: items.some((item) => !item.seen),
        latestAt: items[items.length - 1]!.createdAt,
      });
    }

    // Unseen first, then most recent — the order the Status tab lists them in.
    others.sort((a, b) => {
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return b.latestAt.localeCompare(a.latestAt);
    });

    return NextResponse.json({ groups: [...groups, ...others] });
  });
}

/**
 * Expired statuses are filtered on read, so this is only housekeeping: it keeps
 * the table and the bucket from growing forever. Best-effort and capped, since
 * it rides along on someone else's request — whatever it misses, the next post
 * picks up.
 */
async function sweepExpired(): Promise<void> {
  try {
    const stale = await prisma.waStatus.findMany({
      where: { expiresAt: { lte: new Date() } },
      select: { id: true, attachmentId: true },
      take: 50,
    });
    if (stale.length === 0) return;
    await prisma.waStatus.deleteMany({
      where: { id: { in: stale.map((s) => s.id) } },
    });
    // Status media is never forwarded, so its object is safe to drop with it.
    for (const s of stale) await deleteWaAttachment(s.attachmentId);
  } catch (err) {
    console.error("wpp: could not sweep expired statuses", err);
  }
}

/** Post a status update: text on a colour, or a photo/video with a caption. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();

    const limited = rateLimit(`wpp:status:${me.id}:${clientIp(req)}`, 30, 60 * 60 * 1000);
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "error.rateLimited" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
      );
    }

    const parsed = waStatusSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "validate.invalidInput");
    }
    const { body, backgroundColor, attachmentId } = parsed.data;

    let kind: WaStatusKind = "TEXT";
    let attachment: StatusAttachment | null = null;

    if (attachmentId) {
      // The claim: the caller's own pending STATUS upload, not yet attached to
      // anything. `WaStatus.attachmentId` is unique, so a second status can
      // never adopt the same file even under a race.
      const pending = await prisma.waAttachment.findFirst({
        where: {
          id: attachmentId,
          uploaderId: me.id,
          purpose: "STATUS",
          messageId: null,
          status: { is: null },
        },
        select: waAttachmentSelect,
      });
      if (!pending) throw new ApiError("error.attachmentsUnavailable", 400);

      const mediaKind = attachmentKind(pending.contentType);
      if (mediaKind !== "IMAGE" && mediaKind !== "VIDEO") {
        return apiError("validate.invalidInput");
      }
      kind = mediaKind;
      attachment = pending;
    }

    const now = new Date();
    const created = await prisma.waStatus.create({
      data: {
        userId: me.id,
        kind,
        body,
        backgroundColor: kind === "TEXT" ? (backgroundColor ?? null) : null,
        attachmentId: attachmentId ?? null,
        expiresAt: new Date(now.getTime() + STATUS_TTL_MS),
      },
    });

    // The audience is the author's address book — see the note at the top.
    const audience = await contactIdsOf(me.id);
    await broadcastStatus([me.id, ...audience]);

    await sweepExpired();

    return NextResponse.json(
      statusItem({ ...created, attachment }, { seen: true, viewers: [] }),
    );
  });
}
