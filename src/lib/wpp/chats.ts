import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { formatPhone } from "@/lib/wpp/phone";
import { MAX_PINNED_MESSAGES, isWaOnline, wpp } from "@/lib/wpp/config";
import { blockSetsFor, canSeeField } from "@/lib/wpp/data";
import {
  chatContextFrom,
  contextMemberSelect,
  loadContactMaps,
  serializeWaMessage,
  serializeWaPreview,
  waMessageInclude,
  type ContactMaps,
  type ContextMemberRow,
} from "@/lib/wpp/messages";
import type { WaChatContext } from "@/lib/wpp/messages";
import type {
  WaChatDetail,
  WaChatMemberInfo,
  WaChatSummary,
} from "@/lib/wpp/types";
import type { WppKey } from "@/lib/wpp/i18n";

/**
 * Chat-list and chat-detail serialization.
 *
 * The expensive part of a chat list is that every row is per-viewer: the title
 * is your saved alias (or the raw number if you never saved them), the avatar
 * and "last seen" are subject to *their* privacy settings, and the unread badge
 * is your own cursor. All of that is resolved here in a fixed number of queries
 * regardless of how many chats you have, rather than per row.
 */

type MeRow = {
  id: string;
  readReceipts: boolean;
  lastSeenPrivacy: "EVERYONE" | "CONTACTS" | "NOBODY";
};

type MembershipRow = {
  chatId: string;
  role: "ADMIN" | "MEMBER";
  leftAt: Date | null;
  lastReadAt: Date;
  clearedAt: Date | null;
  pinnedAt: Date | null;
  archivedAt: Date | null;
  mutedUntil: Date | null;
  draft: string | null;
};

/**
 * What to call a 1:1 chat.
 *
 * WhatsApp shows the name you saved someone under, and their bare phone number
 * when you never saved them — that difference is the whole point of the address
 * book, so it's reproduced rather than always showing the account's own name.
 */
function directTitle(
  peer: { id: string; name: string; phone: string; deactivatedAt: Date | null },
  contacts: ContactMaps,
  isSaved: boolean,
): string {
  if (peer.deactivatedAt) return "";
  const alias = contacts.aliasById.get(peer.id);
  if (alias) return alias;
  return isSaved ? peer.name : formatPhone(peer.phone);
}

/** Columns needed to render a participant. */
const peerUserSelect = {
  id: true,
  name: true,
  phone: true,
  about: true,
  avatarUrl: true,
  lastSeenAt: true,
  avatarPrivacy: true,
  aboutPrivacy: true,
  lastSeenPrivacy: true,
  readReceipts: true,
  deactivatedAt: true,
} as const;

type PeerUser = {
  id: string;
  name: string;
  phone: string;
  about: string;
  avatarUrl: string | null;
  lastSeenAt: Date | null;
  avatarPrivacy: "EVERYONE" | "CONTACTS" | "NOBODY";
  aboutPrivacy: "EVERYONE" | "CONTACTS" | "NOBODY";
  lastSeenPrivacy: "EVERYONE" | "CONTACTS" | "NOBODY";
  readReceipts: boolean;
  deactivatedAt: Date | null;
};

/**
 * Presence and "about", filtered through the subject's privacy settings.
 *
 * Last seen is reciprocal in WhatsApp: hiding yours also hides everyone else's
 * from you, which is why `me.lastSeenPrivacy` is part of the decision.
 */
function visibleProfile(
  peer: PeerUser,
  me: MeRow,
  contacts: ContactMaps,
  blocked: { iBlockedThem: boolean; theyBlockedMe: boolean },
) {
  const isMe = peer.id === me.id;
  const isContact = contacts.iAmTheirContact.has(peer.id);

  const canSeeLastSeen =
    !blocked.theyBlockedMe &&
    (isMe || me.lastSeenPrivacy !== "NOBODY") &&
    canSeeField(peer.lastSeenPrivacy, { isMe, isContact });
  const canSeeAvatar =
    !blocked.theyBlockedMe &&
    canSeeField(peer.avatarPrivacy, { isMe, isContact });
  const canSeeAbout =
    !blocked.theyBlockedMe && canSeeField(peer.aboutPrivacy, { isMe, isContact });

  return {
    online: canSeeLastSeen && isWaOnline(peer.lastSeenAt),
    lastSeenAt: canSeeLastSeen ? (peer.lastSeenAt?.toISOString() ?? null) : null,
    avatarUrl: canSeeAvatar ? peer.avatarUrl : null,
    about: canSeeAbout ? peer.about : null,
  };
}

// ── Chat list ───────────────────────────────────────────────────────────────

/**
 * Every chat the viewer participates in, ordered the way WhatsApp orders them:
 * pinned first, then most-recent activity.
 *
 * Archived chats are excluded by default — they live behind their own entry in
 * the list, and only surface again when someone opens it.
 */
export async function listChatSummaries(
  me: MeRow,
  opts: { archived?: boolean } = {},
): Promise<WaChatSummary[]> {
  const memberships = await prisma.waChatMember.findMany({
    where: {
      userId: me.id,
      ...(opts.archived ? { archivedAt: { not: null } } : { archivedAt: null }),
    },
    select: {
      chatId: true,
      role: true,
      leftAt: true,
      lastReadAt: true,
      clearedAt: true,
      pinnedAt: true,
      archivedAt: true,
      mutedUntil: true,
      draft: true,
      chat: {
        select: {
          id: true,
          type: true,
          subject: true,
          iconUrl: true,
          lastMessageAt: true,
          members: {
            select: { ...contextMemberSelect, user: { select: peerUserSelect } },
          },
          messages: {
            where: {
              hides: { none: { userId: me.id } },
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            orderBy: { createdAt: "desc" },
            take: 1,
            include: waMessageInclude,
          },
        },
      },
    },
    orderBy: { chat: { lastMessageAt: "desc" } },
    take: 300,
  });

  if (memberships.length === 0) return [];

  // One address-book load and one block load for the whole list.
  const everyone = memberships.flatMap((m) => m.chat.members.map((x) => x.userId));
  const [contacts, blocks, savedContactIds] = await Promise.all([
    loadContactMaps(me.id, everyone),
    blockSetsFor(me.id),
    prisma.waContact
      .findMany({
        where: { ownerId: me.id, contactId: { in: [...new Set(everyone)] } },
        select: { contactId: true },
      })
      .then((rows) => new Set(rows.map((r) => r.contactId))),
  ]);

  // Unread counts for every chat in one grouped query rather than one per row.
  const unreadFilters = memberships
    .filter((m) => !m.leftAt)
    .map((m) => {
      const cursor =
        m.clearedAt && m.clearedAt > m.lastReadAt ? m.clearedAt : m.lastReadAt;
      return { chatId: m.chatId, createdAt: { gt: cursor } };
    });

  const unreadByChat = new Map<string, number>();
  const mentionsByChat = new Map<string, number>();
  if (unreadFilters.length > 0) {
    const unreadWhere = {
      senderId: { not: me.id },
      kind: { not: "SYSTEM" as const },
      deletedAt: null,
      hides: { none: { userId: me.id } },
      // Expired disappearing messages must not keep a badge alive.
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        { OR: unreadFilters },
      ],
    };

    const [rows, mentionRows] = await Promise.all([
      prisma.waMessage.groupBy({
        by: ["chatId"],
        where: unreadWhere,
        _count: { _all: true },
      }),
      // The `@` badge is its own count, not a filter on the first one: WhatsApp
      // shows "3 unread, 1 of them mentions you" as two separate indicators.
      prisma.waMessage.groupBy({
        by: ["chatId"],
        where: { ...unreadWhere, mentions: { some: { userId: me.id } } },
        _count: { _all: true },
      }),
    ]);
    for (const row of rows) unreadByChat.set(row.chatId, row._count._all);
    for (const row of mentionRows) mentionsByChat.set(row.chatId, row._count._all);
  }

  const summaries = memberships
    .map((m) => ({
      membership: m,
      summary: buildSummary(
        m,
        m.chat,
        me,
        contacts,
        blocks,
        savedContactIds,
        unreadByChat,
        mentionsByChat,
      ),
    }))
    // "Delete chat" and "clear messages" both move `clearedAt` forward without
    // touching a row. A cleared chat with nothing newer has nothing to show, so
    // it drops out of the list — and reappears by itself the moment the other
    // side writes again, which is exactly how WhatsApp behaves.
    .filter(({ membership, summary }) => !(membership.clearedAt && !summary.lastMessage))
    .map(({ summary }) => summary);

  // Pinned chats float to the top, then straight recency — WhatsApp's order.
  return summaries.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.lastActivityAt.localeCompare(a.lastActivityAt);
  });
}

type ChatRow = {
  id: string;
  type: "DIRECT" | "GROUP";
  subject: string | null;
  iconUrl: string | null;
  lastMessageAt: Date;
  members: (ContextMemberRow & { user: PeerUser })[];
  messages: Parameters<typeof serializeWaPreview>[0][];
};

function buildSummary(
  membership: MembershipRow,
  chat: ChatRow,
  me: MeRow,
  contacts: ContactMaps,
  blocks: { iBlocked: Set<string>; blockedMe: Set<string> },
  savedContactIds: Set<string>,
  unreadByChat: Map<string, number>,
  mentionsByChat: Map<string, number>,
): WaChatSummary {
  const ctx = chatContextFrom(
    { id: chat.id, type: chat.type },
    me,
    chat.members,
    contacts,
  );

  const others = chat.members.filter((m) => m.userId !== me.id);
  const isSelfChat = chat.type === "DIRECT" && others.length === 0;
  const peerMember = chat.type === "DIRECT" ? others[0] : undefined;
  const peer = peerMember?.user;

  const peerProfile = peer
    ? visibleProfile(peer, me, contacts, {
        iBlockedThem: blocks.iBlocked.has(peer.id),
        theyBlockedMe: blocks.blockedMe.has(peer.id),
      })
    : null;

  const name =
    chat.type === "GROUP"
      ? (chat.subject ?? "")
      : peer
        ? directTitle(peer, contacts, savedContactIds.has(peer.id))
        // "Message yourself" has no peer to name it after, so it takes the
        // viewer's own name — the client appends "(You)". Left empty it
        // rendered as a nameless row reading just " (Tú)".
        : (chat.members.find((m) => m.userId === me.id)?.user.name ?? "");

  // A "clear chat" cursor doesn't delete rows, so the newest message can still
  // predate it — in which case the row correctly shows no preview at all.
  const latest = chat.messages[0];
  const previewVisible =
    latest &&
    (!membership.clearedAt || latest.createdAt > membership.clearedAt);

  const lastMessage = previewVisible ? serializeWaPreview(latest, ctx) : null;

  return {
    id: chat.id,
    type: chat.type,
    name,
    avatarUrl: chat.type === "GROUP" ? chat.iconUrl : (peerProfile?.avatarUrl ?? null),
    peer: peer
      ? {
          id: peer.id,
          phone: peer.deactivatedAt ? null : peer.phone,
          online: peerProfile?.online ?? false,
          lastSeenAt: peerProfile?.lastSeenAt ?? null,
          about: peerProfile?.about ?? null,
        }
      : null,
    isSelfChat,
    lastMessage,
    lastActivityAt: (lastMessage
      ? new Date(lastMessage.createdAt)
      : chat.lastMessageAt
    ).toISOString(),
    unreadCount: membership.leftAt ? 0 : (unreadByChat.get(chat.id) ?? 0),
    mentionCount: membership.leftAt ? 0 : (mentionsByChat.get(chat.id) ?? 0),
    pinned: membership.pinnedAt != null,
    archived: membership.archivedAt != null,
    mutedUntil:
      membership.mutedUntil && membership.mutedUntil > new Date()
        ? membership.mutedUntil.toISOString()
        : null,
    draft: membership.draft,
    memberCount: chat.members.filter((m) => !m.leftAt).length,
    isMember: membership.leftAt == null,
  };
}

// ── Chat headers (search, starred) ──────────────────────────────────────────

/** Just enough of a chat to label a message that came out of it. */
export type WaChatHeader = {
  id: string;
  type: "DIRECT" | "GROUP";
  name: string;
  avatarUrl: string | null;
  /** Ready to hand to `serializeWaMessage` for the bubble itself. */
  context: WaChatContext;
};

/**
 * Titles, avatars and serialization contexts for an arbitrary set of chats.
 *
 * Search and starred messages both need "which chat is this from, rendered the
 * way *this* viewer sees it" for a handful of chats. Reaching for
 * `listChatSummaries` to get that is enormously wasteful — it loads every chat
 * the user has, with every member and every last message, twice (active and
 * archived), and it was being called once per keystroke. This does the same job
 * for exactly the chats in the result set, in a fixed five queries.
 */
export async function loadChatHeaders(
  me: MeRow,
  chatIds: string[],
): Promise<Map<string, WaChatHeader>> {
  const ids = [...new Set(chatIds)];
  if (ids.length === 0) return new Map();

  const chats = await prisma.waChat.findMany({
    // The membership filter is the authorization: a chat the caller isn't in
    // simply never comes back, so nothing downstream has to re-check.
    where: { id: { in: ids }, members: { some: { userId: me.id } } },
    select: {
      id: true,
      type: true,
      subject: true,
      iconUrl: true,
      members: {
        select: { ...contextMemberSelect, user: { select: peerUserSelect } },
      },
    },
  });

  const everyone = chats.flatMap((c) => c.members.map((m) => m.userId));
  const [contacts, blocks, savedContactIds] = await Promise.all([
    loadContactMaps(me.id, everyone),
    blockSetsFor(me.id),
    prisma.waContact
      .findMany({
        where: { ownerId: me.id, contactId: { in: [...new Set(everyone)] } },
        select: { contactId: true },
      })
      .then((rows) => new Set(rows.map((r) => r.contactId))),
  ]);

  const headers = new Map<string, WaChatHeader>();
  for (const chat of chats) {
    const context = chatContextFrom(
      { id: chat.id, type: chat.type },
      me,
      chat.members,
      contacts,
    );
    const peer = chat.members.find((m) => m.userId !== me.id)?.user;
    const profile = peer
      ? visibleProfile(peer, me, contacts, {
          iBlockedThem: blocks.iBlocked.has(peer.id),
          theyBlockedMe: blocks.blockedMe.has(peer.id),
        })
      : null;

    headers.set(chat.id, {
      id: chat.id,
      type: chat.type,
      name:
        chat.type === "GROUP"
          ? (chat.subject ?? "")
          : peer
            ? directTitle(peer, contacts, savedContactIds.has(peer.id))
            : "",
      avatarUrl: chat.type === "GROUP" ? chat.iconUrl : (profile?.avatarUrl ?? null),
      context,
    });
  }
  return headers;
}

// ── Chat detail ─────────────────────────────────────────────────────────────

/**
 * One chat with its participants, admin flags and whether the viewer may post.
 *
 * `canSend` and `blockedReason` are computed here rather than in the client so
 * the composer never has to reimplement the rules the API enforces — it just
 * renders whatever reason the server gives it.
 */
export async function getChatDetail(
  me: MeRow,
  chatId: string,
): Promise<WaChatDetail> {
  const membership = await prisma.waChatMember.findUnique({
    where: { chatId_userId: { chatId, userId: me.id } },
    select: {
      chatId: true,
      role: true,
      leftAt: true,
      lastReadAt: true,
      clearedAt: true,
      pinnedAt: true,
      archivedAt: true,
      mutedUntil: true,
      draft: true,
      chat: {
        select: {
          id: true,
          type: true,
          subject: true,
          description: true,
          iconUrl: true,
          inviteToken: true,
          onlyAdminsCanSend: true,
          onlyAdminsCanEditInfo: true,
          disappearingSeconds: true,
          lastMessageAt: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true } },
          members: {
            select: {
              ...contextMemberSelect,
              role: true,
              user: { select: peerUserSelect },
            },
          },
          messages: {
            where: {
              hides: { none: { userId: me.id } },
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            orderBy: { createdAt: "desc" },
            take: 1,
            include: waMessageInclude,
          },
        },
      },
    },
  });

  if (!membership) throw new ApiError("error.chatNotFound", 404);
  const chat = membership.chat;

  const memberIds = chat.members.map((m) => m.userId);
  const [contacts, blocks, savedContactIds, unread] = await Promise.all([
    loadContactMaps(me.id, memberIds),
    blockSetsFor(me.id),
    prisma.waContact
      .findMany({
        where: { ownerId: me.id, contactId: { in: memberIds } },
        select: { contactId: true },
      })
      .then((rows) => new Set(rows.map((r) => r.contactId))),
    prisma.waMessage.count({
      where: {
        chatId,
        senderId: { not: me.id },
        kind: { not: "SYSTEM" },
        deletedAt: null,
        hides: { none: { userId: me.id } },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        createdAt: {
          gt:
            membership.clearedAt && membership.clearedAt > membership.lastReadAt
              ? membership.clearedAt
              : membership.lastReadAt,
        },
      },
    }),
  ]);

  const unreadByChat = new Map([[chatId, membership.leftAt ? 0 : unread]]);
  // The detail view has the pinned bar and the open conversation right there, so
  // the `@` badge it would draw is redundant — the list is where that matters.
  const mentionsByChat = new Map([[chatId, 0]]);
  const summary = buildSummary(
    membership,
    chat,
    me,
    contacts,
    blocks,
    savedContactIds,
    unreadByChat,
    mentionsByChat,
  );

  const members: WaChatMemberInfo[] = chat.members
    .filter((m) => !m.leftAt)
    .map((m) => {
      const profile = visibleProfile(m.user, me, contacts, {
        iBlockedThem: blocks.iBlocked.has(m.userId),
        theyBlockedMe: blocks.blockedMe.has(m.userId),
      });
      const isSaved = savedContactIds.has(m.userId);
      return {
        id: m.userId,
        name:
          m.userId === me.id
            ? m.user.name
            : directTitle(m.user, contacts, isSaved),
        phone: m.user.deactivatedAt ? null : m.user.phone,
        avatarUrl: profile.avatarUrl,
        about: profile.about,
        role: m.role,
        isMe: m.userId === me.id,
        online: profile.online,
        lastSeenAt: profile.lastSeenAt,
      };
    })
    .sort((a, b) => {
      // Admins first, then alphabetical — same as the group-info screen.
      if (a.role !== b.role) return a.role === "ADMIN" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  // Why the composer may or may not be usable, as a key the client renders.
  let blockedReason: WppKey | null = null;
  if (membership.leftAt) {
    blockedReason = "chat.youAreNotAMember";
  } else if (
    chat.type === "GROUP" &&
    chat.onlyAdminsCanSend &&
    membership.role !== "ADMIN"
  ) {
    blockedReason = "chat.onlyAdminsCanSend";
  } else if (chat.type === "DIRECT" && summary.peer) {
    if (blocks.iBlocked.has(summary.peer.id)) blockedReason = "chat.blockedBanner";
    else if (blocks.blockedMe.has(summary.peer.id))
      blockedReason = "chat.blockedByBanner";
  }

  // Pinned messages ride along with the chat rather than the timeline: they are
  // shown in a bar above it, and they may well be older than the loaded page.
  const pinnedRows = await prisma.waMessage.findMany({
    where: {
      chatId,
      pinnedAt: { not: null },
      deletedAt: null,
      hides: { none: { userId: me.id } },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: waMessageInclude,
    orderBy: { pinnedAt: "desc" },
    take: MAX_PINNED_MESSAGES,
  });
  const pinnedContext = chatContextFrom(
    { id: chat.id, type: chat.type },
    me,
    chat.members,
    contacts,
  );

  return {
    ...summary,
    description: chat.description,
    disappearingSeconds: chat.disappearingSeconds,
    pinnedMessages: pinnedRows.map((row) =>
      serializeWaMessage(row, pinnedContext),
    ),
    createdAt: chat.createdAt.toISOString(),
    createdBy: chat.createdBy,
    members,
    myRole: membership.role,
    onlyAdminsCanSend: chat.onlyAdminsCanSend,
    onlyAdminsCanEditInfo: chat.onlyAdminsCanEditInfo,
    // The invite link is a capability: only hand it to someone who could
    // legitimately share it.
    inviteUrl:
      chat.type === "GROUP" && membership.role === "ADMIN" && chat.inviteToken
        ? wpp(`/invite/${chat.inviteToken}`)
        : null,
    canSend: blockedReason == null,
    blockedReason,
    peerBlocked: summary.peer ? blocks.iBlocked.has(summary.peer.id) : false,
  };
}
