import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { isWaOnline } from "@/lib/wpp/config";
import type { WaContactItem } from "@/lib/wpp/types";
import type { WaVisibility } from "@/generated/prisma/enums";

/**
 * Authorization + lookup helpers for the WhatsApp clone.
 *
 * Same discipline as `src/lib/data.ts` on the Slack side: **no route handler
 * decides who may see what**. Every handler calls one of these first, and they
 * throw `ApiError` with a dictionary key as the message (see
 * `lib/wpp/validators.ts` for why). Most "not allowed" cases throw 404 rather
 * than 403 so the API never confirms that a chat or account exists.
 */

// ── Direct chats ────────────────────────────────────────────────────────────

/**
 * Canonical dedupe key for a 1:1 chat. Sorting the two ids means both sides
 * compute the same key, and the unique index on it makes a duplicate chat
 * impossible even when both people tap "message" at the same instant.
 */
export function directKeyFor(a: string, b: string): string {
  return [a, b].sort().join(":");
}

/**
 * The existing 1:1 chat between two people, creating it if this is the first
 * message. `otherId === meId` is allowed on purpose — that's WhatsApp's
 * "Message yourself" chat.
 */
export async function findOrCreateDirectChat(meId: string, otherId: string) {
  const other = await prisma.waUser.findFirst({
    where: { id: otherId, deactivatedAt: null },
    select: { id: true },
  });
  if (!other) throw new ApiError("error.userNotFound", 404);

  await assertNotBlocked(meId, otherId);

  const directKey = directKeyFor(meId, otherId);
  const existing = await prisma.waChat.findUnique({ where: { directKey } });
  if (existing) {
    // The chat row outlives either side deleting it, so re-opening one has to
    // restore the caller's membership rather than assume it. Without this,
    // "delete chat" then "message them again" would hand back a chat id the
    // caller is not a member of — a 404 they could never escape, because the
    // unique `directKey` prevents a replacement chat from ever being created.
    await prisma.waChatMember.upsert({
      where: { chatId_userId: { chatId: existing.id, userId: meId } },
      create: { chatId: existing.id, userId: meId },
      update: { leftAt: null },
    });
    return existing;
  }

  const memberIds = meId === otherId ? [meId] : [meId, otherId];
  try {
    return await prisma.waChat.create({
      data: {
        type: "DIRECT",
        directKey,
        createdById: meId,
        members: { create: memberIds.map((userId) => ({ userId })) },
      },
    });
  } catch {
    // Lost the race against a concurrent create — the unique index did its job,
    // so just read back the row the other request committed.
    const raced = await prisma.waChat.findUnique({ where: { directKey } });
    if (raced) return raced;
    throw new ApiError("error.chatNotFound", 404);
  }
}

// ── Membership ──────────────────────────────────────────────────────────────

/**
 * The caller's membership row plus the chat. A member who has *left* a group
 * still gets a row back: WhatsApp keeps the conversation visible, read-only,
 * until you delete it. Use `requireActiveChatMember` where writing is involved.
 */
export async function requireChatMember(userId: string, chatId: string) {
  const member = await prisma.waChatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
    include: { chat: true },
  });
  if (!member) throw new ApiError("error.chatNotFound", 404);
  return member;
}

export async function requireActiveChatMember(userId: string, chatId: string) {
  const member = await requireChatMember(userId, chatId);
  if (member.leftAt) throw new ApiError("error.notMember", 403);
  return member;
}

export async function requireChatAdmin(userId: string, chatId: string) {
  const member = await requireActiveChatMember(userId, chatId);
  if (member.chat.type === "GROUP" && member.role !== "ADMIN") {
    throw new ApiError("error.onlyAdmins", 403);
  }
  return member;
}

/** Every current participant's id — the audience for a realtime broadcast. */
export async function chatMemberIds(chatId: string): Promise<string[]> {
  const members = await prisma.waChatMember.findMany({
    where: { chatId, leftAt: null },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

/** The other person in a 1:1 chat (null for groups and the self-chat). */
export async function directPeerId(
  chatId: string,
  meId: string,
): Promise<string | null> {
  const member = await prisma.waChatMember.findFirst({
    where: { chatId, userId: { not: meId } },
    select: { userId: true },
  });
  return member?.userId ?? null;
}

/**
 * Move *this* user's delivery cursor to now in every chat they're in.
 *
 * The mirror image of `markDeliveredToConnected` (lib/wpp/realtime.ts), which
 * advances everyone *else's* cursor when a message is written. This one runs
 * when the user's own client shows up — opening the SSE stream or sending a
 * heartbeat — because that is the same "their client has it" evidence, just
 * arriving from the other direction.
 *
 * Returns the chats whose ticks actually changed, so the caller only has to
 * broadcast receipts for those: a heartbeat from an idle client normally has
 * nothing to announce, and fanning out regardless would put every peer's chat
 * list into a refetch loop every 25 seconds.
 */
export async function advanceDeliveryCursors(userId: string): Promise<string[]> {
  const memberships = await prisma.waChatMember.findMany({
    where: { userId, leftAt: null },
    select: {
      chatId: true,
      lastDeliveredAt: true,
      chat: { select: { lastMessageAt: true } },
    },
    take: 300,
  });
  if (memberships.length === 0) return [];

  // Compare each chat's denormalised `lastMessageAt` against this member's
  // cursor, in memory. The precise question — "are there messages from someone
  // else newer than my cursor" — needs a grouped query with one OR arm per
  // chat, and this runs on every 25-second heartbeat of every open tab. The
  // approximation is one query with no arms and errs only towards an extra
  // receipts broadcast (a system message moves `lastMessageAt` without moving
  // anyone's cursor); the caller's own sends can't trigger it, because sending
  // advances their cursor in the same transaction.
  const stale = memberships
    .filter((m) => m.chat.lastMessageAt > m.lastDeliveredAt)
    .map((m) => m.chatId);

  await prisma.waChatMember.updateMany({
    where: { userId, leftAt: null },
    data: { lastDeliveredAt: new Date() },
  });

  return stale;
}

/**
 * Make sure a group still has at least one admin.
 *
 * Called from *every* path that can remove the last one — leaving, deleting the
 * chat, deleting the account. A group with no admin is unrecoverable: nobody can
 * add members, rotate the invite link, rename it, or (with `onlyAdminsCanSend`)
 * post at all, and there is no endpoint that could grant the role back.
 *
 * The longest-standing remaining participant inherits it, which is what
 * WhatsApp does.
 */
export async function ensureGroupHasAdmin(chatId: string): Promise<void> {
  const admins = await prisma.waChatMember.count({
    where: { chatId, role: "ADMIN", leftAt: null },
  });
  if (admins > 0) return;

  const heir = await prisma.waChatMember.findFirst({
    where: { chatId, leftAt: null },
    orderBy: { joinedAt: "asc" },
    select: { userId: true },
  });
  if (!heir) return; // empty group — nothing to hand over

  await prisma.waChatMember.update({
    where: { chatId_userId: { chatId, userId: heir.userId } },
    data: { role: "ADMIN" },
  });
}

// ── Blocking ────────────────────────────────────────────────────────────────

/**
 * A block cuts both ways, exactly like WhatsApp: the blocker's chat shows
 * "unblock to send", and the blocked person's messages simply never arrive.
 * Distinct keys so the UI can say which of the two happened.
 */
export async function assertNotBlocked(meId: string, otherId: string) {
  if (meId === otherId) return;
  const block = await prisma.waBlock.findFirst({
    where: {
      OR: [
        { blockerId: meId, blockedId: otherId },
        { blockerId: otherId, blockedId: meId },
      ],
    },
    select: { blockerId: true },
  });
  if (!block) return;
  throw new ApiError(
    block.blockerId === meId ? "error.blockedByYou" : "error.blocked",
    403,
  );
}

export async function blockStateBetween(meId: string, otherId: string) {
  if (meId === otherId) return { iBlockedThem: false, theyBlockedMe: false };
  const blocks = await prisma.waBlock.findMany({
    where: {
      OR: [
        { blockerId: meId, blockedId: otherId },
        { blockerId: otherId, blockedId: meId },
      ],
    },
    select: { blockerId: true },
  });
  return {
    iBlockedThem: blocks.some((b) => b.blockerId === meId),
    theyBlockedMe: blocks.some((b) => b.blockerId === otherId),
  };
}

// ── Sending ─────────────────────────────────────────────────────────────────

/**
 * Everything that has to be true before a message can be written to a chat:
 * you're still a participant, the group isn't admins-only, and — for a 1:1 —
 * neither side has blocked the other.
 */
export async function requireCanSend(userId: string, chatId: string) {
  const member = await requireActiveChatMember(userId, chatId);

  if (member.chat.type === "GROUP") {
    if (member.chat.onlyAdminsCanSend && member.role !== "ADMIN") {
      throw new ApiError("error.onlyAdmins", 403);
    }
  } else {
    const peerId = await directPeerId(chatId, userId);
    if (peerId) await assertNotBlocked(userId, peerId);
  }

  return member;
}

// ── Messages ────────────────────────────────────────────────────────────────

/** Ensure the caller can see a message, and return it with its chat. */
export async function requireMessageAccess(userId: string, messageId: string) {
  const message = await prisma.waMessage.findUnique({
    where: { id: messageId },
    include: { chat: { select: { id: true, type: true } } },
  });
  if (!message) throw new ApiError("error.notFound", 404);
  await requireChatMember(userId, message.chatId);
  return message;
}

// ── Contacts & profile privacy ──────────────────────────────────────────────

/** Is `viewerId` saved in `ownerId`'s address book? */
export async function isContactOf(
  ownerId: string,
  viewerId: string,
): Promise<boolean> {
  if (ownerId === viewerId) return true;
  const row = await prisma.waContact.findUnique({
    where: { ownerId_contactId: { ownerId, contactId: viewerId } },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Resolve one of the "Everyone / My contacts / Nobody" settings for a viewer.
 *
 * `isContact` is passed in rather than queried so a caller listing 50 chats can
 * fetch the contact set once instead of 50 times.
 */
export function canSeeField(
  visibility: WaVisibility,
  { isMe, isContact }: { isMe: boolean; isContact: boolean },
): boolean {
  if (isMe) return true;
  if (visibility === "EVERYONE") return true;
  if (visibility === "NOBODY") return false;
  return isContact;
}

/** The set of user ids the caller has saved as contacts. */
export async function contactIdsOf(ownerId: string): Promise<Set<string>> {
  const rows = await prisma.waContact.findMany({
    where: { ownerId },
    select: { contactId: true },
  });
  return new Set(rows.map((r) => r.contactId));
}

/** The set of user ids who have saved the caller as a contact. */
export async function contactOfIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.waContact.findMany({
    where: { contactId: userId },
    select: { ownerId: true },
  });
  return new Set(rows.map((r) => r.ownerId));
}

/** Everyone the caller has blocked, plus everyone who has blocked them. */
export async function blockSetsFor(userId: string) {
  const rows = await prisma.waBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  const iBlocked = new Set<string>();
  const blockedMe = new Set<string>();
  for (const row of rows) {
    if (row.blockerId === userId) iBlocked.add(row.blockedId);
    else blockedMe.add(row.blockerId);
  }
  return { iBlocked, blockedMe };
}

/**
 * Render a set of accounts as address-book rows for the caller.
 *
 * Shared by the contacts list and the blocked list, which show the same card
 * with a different source set. Every field is per-viewer: the name is the alias
 * *you* saved, and the photo, "about" and online dot are whatever the subject's
 * privacy settings let you see. Same rules as `visibleProfile` in
 * `lib/wpp/chats.ts` — including that last seen is reciprocal, so hiding yours
 * hides everyone else's from you.
 *
 * Deactivated accounts are dropped rather than rendered blank: a contact whose
 * account is gone is not a contact any more.
 */
export async function listWaContactItems(
  me: { id: string; lastSeenPrivacy: WaVisibility },
  userIds: string[],
): Promise<WaContactItem[]> {
  // Yourself is never a row here — "Message yourself" is a chat, not a contact.
  const ids = [...new Set(userIds)].filter((id) => id !== me.id);
  if (ids.length === 0) return [];

  const [people, aliases, savedMe, blocks, directChats] = await Promise.all([
    prisma.waUser.findMany({
      where: { id: { in: ids }, deactivatedAt: null },
      select: {
        id: true,
        name: true,
        phone: true,
        about: true,
        avatarUrl: true,
        lastSeenAt: true,
        avatarPrivacy: true,
        aboutPrivacy: true,
        lastSeenPrivacy: true,
      },
    }),
    prisma.waContact.findMany({
      where: { ownerId: me.id, contactId: { in: ids } },
      select: { contactId: true, alias: true },
    }),
    prisma.waContact.findMany({
      where: { contactId: me.id, ownerId: { in: ids } },
      select: { ownerId: true },
    }),
    blockSetsFor(me.id),
    // The 1:1 chat with each of them, if one exists — the row links straight
    // into the conversation instead of creating a second one.
    prisma.waChat.findMany({
      where: { directKey: { in: ids.map((id) => directKeyFor(me.id, id)) } },
      select: { id: true, directKey: true },
    }),
  ]);

  const aliasById = new Map(
    aliases.filter((a) => a.alias).map((a) => [a.contactId, a.alias as string]),
  );
  const savedByMe = new Set(aliases.map((a) => a.contactId));
  const theySavedMe = new Set(savedMe.map((c) => c.ownerId));
  const chatByKey = new Map(directChats.map((c) => [c.directKey ?? "", c.id]));

  return people
    .map((person) => {
      // "My contacts" is judged from the *subject's* address book: they saved
      // me, so I'm allowed to see what they limited to their contacts.
      const isContact = theySavedMe.has(person.id);
      const opts = { isMe: false, isContact };
      // Someone who blocked me sees none of my activity and I see none of
      // theirs — the block hides the profile in both directions.
      const hidden = blocks.blockedMe.has(person.id);
      const canSeeLastSeen =
        !hidden &&
        me.lastSeenPrivacy !== "NOBODY" &&
        canSeeField(person.lastSeenPrivacy, opts);

      return {
        id: person.id,
        name: aliasById.get(person.id) ?? person.name,
        phone: person.phone,
        avatarUrl:
          !hidden && canSeeField(person.avatarPrivacy, opts)
            ? person.avatarUrl
            : null,
        about:
          !hidden && canSeeField(person.aboutPrivacy, opts) ? person.about : null,
        online: canSeeLastSeen && isWaOnline(person.lastSeenAt),
        chatId: chatByKey.get(directKeyFor(me.id, person.id)) ?? null,
        isContact: savedByMe.has(person.id),
        blocked: blocks.iBlocked.has(person.id),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Group invite links ──────────────────────────────────────────────────────

export function newInviteToken(): string {
  // 22 URL-safe chars ≈ 128 bits, same shape as a real chat.whatsapp.com token.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
