import "server-only";
import { prisma } from "@/lib/prisma";
import { serializeWaAttachment, waAttachmentSelect } from "@/lib/wpp/uploads";
import { MESSAGE_PAGE_SIZE, isWaOnline } from "@/lib/wpp/config";
import { canSeeField } from "@/lib/wpp/data";
import { waMentionToken } from "@/lib/wpp/mentions";
import type {
  WaChatPreview,
  WaMessage,
  WaMessageKindName,
  WaPerson,
  WaPollResult,
  WaQuoted,
  WaReactionGroup,
  WaSystemAction,
  WaSystemPayload,
  WaTick,
} from "@/lib/wpp/types";

/**
 * Single source of truth for message shape in the WhatsApp clone — the analogue
 * of `src/lib/messages.ts`. Query with `waMessageInclude`, serialize with
 * `serializeWaMessage`, never hand-roll either.
 *
 * ## The payload is per-viewer
 * `mine`, `tick`, `starred` and every display name depend on *who is asking*:
 * the same row renders with a saved contact alias for one person and a raw
 * phone number for another. That's why realtime events push change *signals*
 * and the client re-fetches, rather than the server broadcasting a payload.
 */

export const waMessageInclude = {
  sender: { select: { id: true, name: true, avatarUrl: true } },
  attachments: { orderBy: { createdAt: "asc" }, select: waAttachmentSelect },
  reactions: { select: { emoji: true, userId: true } },
  mentions: { select: { userId: true } },
  poll: {
    select: {
      id: true,
      question: true,
      allowMultiple: true,
      closedAt: true,
      options: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          text: true,
          votes: { select: { userId: true } },
        },
      },
    },
  },
  replyTo: {
    select: {
      id: true,
      kind: true,
      body: true,
      senderId: true,
      deletedAt: true,
      sender: { select: { id: true, name: true } },
    },
  },
} as const;

type WaMessageRow = Awaited<
  ReturnType<
    typeof prisma.waMessage.findFirstOrThrow<{ include: typeof waMessageInclude }>
  >
>;

/** Read/delivery cursors for one participant, used to resolve ticks. */
type PeerCursor = {
  userId: string;
  lastReadAt: Date;
  lastDeliveredAt: Date;
  readReceipts: boolean;
};

export type WaChatContext = {
  meId: string;
  chatId: string;
  chatType: "DIRECT" | "GROUP";
  viewerReadReceipts: boolean;
  /** Active participants other than the viewer. */
  peers: PeerCursor[];
  /** Resolve a participant to the name/avatar *this viewer* should see. */
  person: (userId: string | null, fallbackName?: string | null) => WaPerson | null;
  /** Message ids the viewer starred; filled in by the list helpers. */
  starredIds: Set<string>;
};

// ── Ticks ───────────────────────────────────────────────────────────────────

/**
 * One tick / two ticks / two blue ticks for a message the viewer sent.
 *
 * A message is *delivered* once every other participant's client has been seen
 * since it was written, and *read* once every one of them has scrolled past it.
 * Group chats are all-or-nothing, exactly like WhatsApp: one straggler keeps the
 * whole message on grey double ticks.
 *
 * Read receipts are reciprocal in 1:1 chats — turning yours off also stops you
 * seeing anyone else's — and are ignored inside groups, again matching WhatsApp.
 */
export function computeTick(createdAt: Date, ctx: WaChatContext): WaTick {
  if (ctx.peers.length === 0) return "sent";
  const at = createdAt.getTime();

  if (!ctx.peers.every((p) => p.lastDeliveredAt.getTime() >= at)) return "sent";
  if (ctx.chatType === "DIRECT" && !ctx.viewerReadReceipts) return "delivered";

  const allRead = ctx.peers.every(
    (p) =>
      (ctx.chatType === "GROUP" || p.readReceipts) &&
      p.lastReadAt.getTime() >= at,
  );
  return allRead ? "read" : "delivered";
}

// ── Context ─────────────────────────────────────────────────────────────────

/** The member columns a context needs. Reuse in every `select` that feeds one. */
export const contextMemberSelect = {
  userId: true,
  leftAt: true,
  lastReadAt: true,
  lastDeliveredAt: true,
  user: {
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      avatarPrivacy: true,
      readReceipts: true,
    },
  },
} as const;

export type ContextMemberRow = {
  userId: string;
  leftAt: Date | null;
  lastReadAt: Date;
  lastDeliveredAt: Date;
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
    avatarPrivacy: "EVERYONE" | "CONTACTS" | "NOBODY";
    readReceipts: boolean;
  };
};

/** The viewer's address book, in the two directions privacy cares about. */
export type ContactMaps = {
  /** contactId → the alias the viewer saved them under. */
  aliasById: Map<string, string>;
  /** People who have the viewer in *their* address book. */
  iAmTheirContact: Set<string>;
  /**
   * People who have blocked the viewer. A block hides the profile in both
   * directions, so this has to reach name/avatar resolution too — otherwise a
   * blocker's photo would be stripped from the chat header (`visibleProfile`)
   * and still served on every one of their message bubbles.
   */
  blockedMe: Set<string>;
};

/**
 * Assemble a context from rows the caller already has.
 *
 * Split out from `buildChatContext` so listing 200 chats costs two address-book
 * queries in total rather than two per chat.
 */
export function chatContextFrom(
  chat: { id: string; type: "DIRECT" | "GROUP" },
  me: { id: string; readReceipts: boolean },
  members: ContextMemberRow[],
  contacts: ContactMaps,
): WaChatContext {
  const byId = new Map(members.map((m) => [m.userId, m]));

  const person: WaChatContext["person"] = (userId, fallbackName) => {
    if (!userId) return null;
    const user = byId.get(userId)?.user;
    const baseName = user?.name ?? fallbackName ?? "";
    // A saved alias always wins: WhatsApp shows what *you* called someone, not
    // what they call themselves.
    const name = contacts.aliasById.get(userId) ?? baseName;
    const showAvatar =
      user != null &&
      !contacts.blockedMe.has(userId) &&
      canSeeField(user.avatarPrivacy, {
        isMe: userId === me.id,
        // "My contacts" is judged from the *subject's* address book: they saved
        // me, so I'm allowed to see what they limited to their contacts.
        isContact: contacts.iAmTheirContact.has(userId),
      });
    return {
      id: userId,
      name,
      phone: null,
      avatarUrl: showAvatar ? (user?.avatarUrl ?? null) : null,
    };
  };

  return {
    meId: me.id,
    chatId: chat.id,
    chatType: chat.type,
    viewerReadReceipts: me.readReceipts,
    peers: members
      .filter((m) => m.userId !== me.id && !m.leftAt)
      .map((m) => ({
        userId: m.userId,
        lastReadAt: m.lastReadAt,
        lastDeliveredAt: m.lastDeliveredAt,
        readReceipts: m.user.readReceipts,
      })),
    person,
    starredIds: new Set<string>(),
  };
}

/** Load the viewer's address book for a fixed set of people. */
export async function loadContactMaps(
  meId: string,
  userIds: string[],
): Promise<ContactMaps> {
  const ids = [...new Set(userIds)];
  const [aliases, savedMe, blocks] = await Promise.all([
    prisma.waContact.findMany({
      where: { ownerId: meId, contactId: { in: ids } },
      select: { contactId: true, alias: true },
    }),
    prisma.waContact.findMany({
      where: { contactId: meId, ownerId: { in: ids } },
      select: { ownerId: true },
    }),
    prisma.waBlock.findMany({
      where: { blockedId: meId, blockerId: { in: ids } },
      select: { blockerId: true },
    }),
  ]);
  return {
    aliasById: new Map(
      aliases.filter((a) => a.alias).map((a) => [a.contactId, a.alias as string]),
    ),
    iAmTheirContact: new Set(savedMe.map((c) => c.ownerId)),
    blockedMe: new Set(blocks.map((b) => b.blockerId)),
  };
}

/**
 * Everything `serializeWaMessage` needs that isn't on the message row: the
 * participant cursors and the viewer-specific name/avatar resolution.
 *
 * Built once per chat load, not once per message — 50 messages from 8 people
 * cost the same three queries as one message.
 */
export async function buildChatContext(
  chat: { id: string; type: "DIRECT" | "GROUP" },
  me: { id: string; readReceipts: boolean },
): Promise<WaChatContext> {
  const members = await prisma.waChatMember.findMany({
    where: { chatId: chat.id },
    select: contextMemberSelect,
  });
  const contacts = await loadContactMaps(
    me.id,
    members.map((m) => m.userId),
  );
  return chatContextFrom(chat, me, members, contacts);
}

// ── System messages ─────────────────────────────────────────────────────────

type StoredSystemMeta = {
  actorId?: string | null;
  actorName?: string;
  targets?: { id: string; name: string }[];
  value?: string;
};

/**
 * Rehydrate a system message.
 *
 * The row stores an action plus operands rather than a sentence, so the same
 * event reads as "Ada added Grace" in English and "Ada añadió a Grace" in
 * Spanish. Names are re-resolved through the viewer's address book where
 * possible and fall back to what was recorded at the time — which is what keeps
 * "Ada removed Linus" readable after Linus deletes his account.
 */
function parseSystem(
  action: string,
  meta: string | null,
  ctx: WaChatContext,
): WaSystemPayload | null {
  let parsed: StoredSystemMeta = {};
  if (meta) {
    try {
      parsed = JSON.parse(meta) as StoredSystemMeta;
    } catch {
      parsed = {};
    }
  }
  const actorId = parsed.actorId ?? null;
  const targets = parsed.targets ?? [];
  return {
    action: action as WaSystemAction,
    actorId,
    actor: ctx.person(actorId, parsed.actorName)?.name ?? parsed.actorName ?? "",
    targetIds: targets.map((t) => t.id),
    targets: targets.map((t) => ctx.person(t.id, t.name)?.name ?? t.name),
    value: parsed.value,
  };
}

/** Build the `systemMeta` JSON written alongside a SYSTEM message. */
export function systemMeta(input: {
  actorId?: string | null;
  actorName?: string;
  targets?: { id: string; name: string }[];
  value?: string;
}): string {
  return JSON.stringify(input);
}

/**
 * Record a group event ("Ada added Grace") as a message in the timeline.
 *
 * It bumps `lastMessageAt` like any other message, so a group that only had
 * membership changes still sorts sensibly in the chat list — which is what
 * WhatsApp does.
 */
export async function writeSystemMessage(
  chatId: string,
  action: WaSystemAction,
  meta: Parameters<typeof systemMeta>[0],
) {
  const message = await prisma.waMessage.create({
    data: {
      chatId,
      kind: "SYSTEM",
      body: "",
      systemAction: action,
      systemMeta: systemMeta(meta),
    },
  });
  await prisma.waChat.update({
    where: { id: chatId },
    data: { lastMessageAt: message.createdAt },
  });
  return message;
}

// ── Serialization ───────────────────────────────────────────────────────────

function groupReactions(
  reactions: { emoji: string; userId: string }[],
  ctx: WaChatContext,
): WaReactionGroup[] {
  const grouped = new Map<string, WaReactionGroup>();
  for (const r of reactions) {
    const entry = grouped.get(r.emoji) ?? {
      emoji: r.emoji,
      count: 0,
      users: [],
      mine: false,
    };
    entry.count += 1;
    entry.users.push(ctx.person(r.userId)?.name ?? "");
    if (r.userId === ctx.meId) entry.mine = true;
    grouped.set(r.emoji, entry);
  }
  // Most-reacted first, like the reaction row under a WhatsApp bubble.
  return [...grouped.values()].sort((a, b) => b.count - a.count);
}

/**
 * Poll results as the viewer should see them.
 *
 * Voter identities are always included: WhatsApp polls are not secret ballots —
 * tapping the count shows exactly who chose what — and hiding them would make
 * the "View votes" sheet impossible without a second round trip.
 */
function serializePoll(
  poll: NonNullable<WaMessageRow["poll"]>,
  senderId: string | null,
  ctx: WaChatContext,
): WaPollResult {
  const distinctVoters = new Set<string>();
  const options = poll.options.map((option) => {
    for (const vote of option.votes) distinctVoters.add(vote.userId);
    return {
      id: option.id,
      text: option.text,
      votes: option.votes.length,
      voters: option.votes.map((v) => ctx.person(v.userId)?.name ?? ""),
      mine: option.votes.some((v) => v.userId === ctx.meId),
    };
  });

  return {
    id: poll.id,
    question: poll.question,
    allowMultiple: poll.allowMultiple,
    closed: poll.closedAt != null,
    options,
    totalVoters: distinctVoters.size,
    canClose: senderId === ctx.meId && poll.closedAt == null,
  };
}

function serializeQuoted(
  replyTo: WaMessageRow["replyTo"],
  ctx: WaChatContext,
): WaQuoted | null {
  if (!replyTo) return null;
  const deleted = replyTo.deletedAt != null;
  return {
    id: replyTo.id,
    kind: replyTo.kind as WaMessageKindName,
    body: deleted ? "" : replyTo.body,
    senderId: replyTo.senderId,
    senderName:
      ctx.person(replyTo.senderId, replyTo.sender?.name)?.name ??
      replyTo.sender?.name ??
      "",
    deleted,
  };
}

export function serializeWaMessage(
  message: WaMessageRow,
  ctx: WaChatContext,
): WaMessage {
  const deleted = message.deletedAt != null;
  const mine = message.senderId === ctx.meId;
  const isVoice = message.kind === "VOICE";

  return {
    id: message.id,
    chatId: message.chatId,
    kind: message.kind as WaMessageKindName,
    // A deleted message keeps its row so replies quoting it still resolve, but
    // nothing of its content survives serialization.
    body: deleted ? "" : message.body,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    deleted,
    mine,
    sender: ctx.person(message.senderId, message.sender?.name),
    system:
      message.systemAction != null
        ? parseSystem(message.systemAction, message.systemMeta, ctx)
        : null,
    replyTo: deleted ? null : serializeQuoted(message.replyTo, ctx),
    forwardScore: message.forwardScore,
    attachments: deleted
      ? []
      : message.attachments.map((a) => serializeWaAttachment(a, { voice: isVoice })),
    reactions: deleted ? [] : groupReactions(message.reactions, ctx),
    starred: ctx.starredIds.has(message.id),
    tick: mine && !deleted ? computeTick(message.createdAt, ctx) : null,
    poll: deleted || !message.poll
      ? null
      : serializePoll(message.poll, message.senderId, ctx),
    pinned: message.pinnedAt != null,
    expiresAt: message.expiresAt?.toISOString() ?? null,
    mentionsMe:
      !deleted && message.mentions.some((m) => m.userId === ctx.meId),
    // Only tokens that resolved to a real participant are handed to the client,
    // so an "@" in an email address is never highlighted as a mention.
    mentionTokens: deleted
      ? []
      : [
          ...new Set(
            message.mentions
              .map((m) => ctx.person(m.userId)?.name ?? "")
              .filter(Boolean)
              .map((name) => waMentionToken(name).slice(1).toLowerCase()),
          ),
        ],
  };
}

/** The one-line preview shown on a chat-list row. */
export function serializeWaPreview(
  message: WaMessageRow,
  ctx: WaChatContext,
): WaChatPreview {
  const deleted = message.deletedAt != null;
  const mine = message.senderId === ctx.meId;
  return {
    id: message.id,
    kind: message.kind as WaMessageKindName,
    body: deleted ? "" : message.body,
    createdAt: message.createdAt.toISOString(),
    senderId: message.senderId,
    senderName: ctx.person(message.senderId, message.sender?.name)?.name ?? "",
    mine,
    deleted,
    system:
      message.systemAction != null
        ? parseSystem(message.systemAction, message.systemMeta, ctx)
        : null,
    tick: mine && !deleted ? computeTick(message.createdAt, ctx) : null,
  };
}

// ── Queries ─────────────────────────────────────────────────────────────────

/**
 * Rows the viewer is allowed to see in a chat: not deleted-for-them, and newer
 * than their "clear messages" cursor. Both are per-user, which is why they live
 * in the `where` rather than being filtered after the fact.
 */
export function visibleMessagesWhere(
  chatId: string,
  meId: string,
  clearedAt: Date | null,
) {
  return {
    chatId,
    hides: { none: { userId: meId } },
    ...(clearedAt ? { createdAt: { gt: clearedAt } } : {}),
    // A disappearing message is gone the instant it expires, whether or not the
    // sweep has caught up. Filtering on read is what makes that a guarantee
    // rather than a promise about how often a background job runs.
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
}

/**
 * The most recent page of a chat, oldest-first for rendering. `before` pages
 * backwards through history for the "load older messages" control.
 */
export async function listChatMessages(
  chat: { id: string; type: "DIRECT" | "GROUP" },
  me: { id: string; readReceipts: boolean },
  opts: { clearedAt: Date | null; before?: string; take?: number },
): Promise<{ messages: WaMessage[]; hasMore: boolean }> {
  const take = opts.take ?? MESSAGE_PAGE_SIZE;
  const where = visibleMessagesWhere(chat.id, me.id, opts.clearedAt);

  const rows = await prisma.waMessage.findMany({
    where,
    include: waMessageInclude,
    // `id` breaks ties on `createdAt`, which is only millisecond-precision and
    // does collide in practice — editing a group writes up to four system
    // messages back to back. Without a total order the cursor can repeat one
    // message and skip another at a page boundary.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1, // one extra: its presence is the "has more" signal
    ...(opts.before ? { cursor: { id: opts.before }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  const ctx = await buildChatContext(chat, me);
  const starred = await prisma.waMessageStar.findMany({
    where: { userId: me.id, messageId: { in: page.map((m) => m.id) } },
    select: { messageId: true },
  });
  ctx.starredIds = new Set(starred.map((s) => s.messageId));

  return {
    messages: page.reverse().map((m) => serializeWaMessage(m, ctx)),
    hasMore,
  };
}

/**
 * Unread count for one chat: newer than the read cursor, not the viewer's own,
 * not hidden, and not a system message — WhatsApp never badges "Ada joined".
 */
export function unreadWhere(
  chatId: string,
  meId: string,
  lastReadAt: Date,
  clearedAt: Date | null,
) {
  const after = clearedAt && clearedAt > lastReadAt ? clearedAt : lastReadAt;
  return {
    chatId,
    createdAt: { gt: after },
    senderId: { not: meId },
    kind: { not: "SYSTEM" as const },
    deletedAt: null,
    hides: { none: { userId: meId } },
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  };
}

/** Presence + "last seen", already filtered through the subject's privacy. */
export function presenceFor(
  user: { lastSeenAt: Date | null; lastSeenPrivacy: string },
  viewer: { canSee: boolean },
): { online: boolean; lastSeenAt: string | null } {
  if (!viewer.canSee) return { online: false, lastSeenAt: null };
  return {
    online: isWaOnline(user.lastSeenAt),
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
  };
}
