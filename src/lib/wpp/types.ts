import type { WppSerializedAttachment } from "@/lib/wpp/upload-limits";
import type { WppKey } from "@/lib/wpp/i18n";

/**
 * The wire shapes exchanged between `/api/wpp/**` and the client.
 *
 * Dependency-free (types only) so client components can import them without
 * dragging Prisma or `server-only` modules into the browser bundle.
 * `lib/wpp/messages.ts` is what actually produces them.
 */

/** Delivery state of a message *you* sent — the one/two/blue ticks. */
export type WaTick = "sent" | "delivered" | "read";

export type WaMessageKindName =
  | "TEXT"
  | "IMAGE"
  | "VIDEO"
  | "AUDIO"
  | "VOICE"
  | "DOCUMENT"
  | "SYSTEM"
  | "POLL";

export type WaPerson = {
  id: string;
  /** Saved contact alias if there is one, otherwise the account's own name. */
  name: string;
  /** Null when privacy hides it, or when the account is gone. */
  phone: string | null;
  avatarUrl: string | null;
};

/**
 * The actions a SYSTEM message can record. Stored as-is in
 * `WaMessage.systemAction`, and rendered per-viewer in their own language —
 * which is exactly why the row holds an action + operands rather than a
 * pre-formatted sentence.
 */
export type WaSystemAction =
  | "group.created"
  | "group.subject"
  | "group.description"
  | "group.icon"
  | "group.settings"
  | "member.added"
  | "member.removed"
  | "member.left"
  | "member.joinedViaLink"
  | "admin.granted"
  | "admin.revoked"
  | "chat.disappearingOn"
  | "chat.disappearingOff"
  | "message.pinned"
  | "message.unpinned";

export type WaSystemPayload = {
  action: WaSystemAction;
  /** Display name of whoever performed the action. */
  actor: string;
  /** Null for actions with no actor left to attribute them to. */
  actorId: string | null;
  /** Display names the action was performed on (added/removed participants). */
  targets: string[];
  /** Ids parallel to `targets`, so the viewer sees "You" instead of their name. */
  targetIds: string[];
  /** Free operand — the new group name, for instance. */
  value?: string;
};

/** Dictionary key that renders a given system action. */
export const SYSTEM_MESSAGE_KEYS: Record<WaSystemAction, WppKey> = {
  "group.created": "system.groupCreated",
  "group.subject": "system.subjectChanged",
  "group.description": "system.descriptionChanged",
  "group.icon": "system.iconChanged",
  "group.settings": "system.settingsChanged",
  "member.added": "system.membersAdded",
  "member.removed": "system.memberRemoved",
  "member.left": "system.memberLeft",
  "member.joinedViaLink": "system.memberJoinedViaLink",
  "admin.granted": "system.adminGranted",
  "admin.revoked": "system.adminRevoked",
  "chat.disappearingOn": "system.disappearingOn",
  "chat.disappearingOff": "system.disappearingOff",
  "message.pinned": "system.messagePinned",
  "message.unpinned": "system.messageUnpinned",
};

export type WaPollOptionResult = {
  id: string;
  text: string;
  votes: number;
  /** Display names, for the "who voted" sheet. */
  voters: string[];
  /** The viewer picked this one. */
  mine: boolean;
};

export type WaPollResult = {
  id: string;
  question: string;
  allowMultiple: boolean;
  closed: boolean;
  options: WaPollOptionResult[];
  /** Distinct people who voted at all — the denominator WhatsApp shows. */
  totalVoters: number;
  /** The viewer may stop the poll (they created the message). */
  canClose: boolean;
};

export type WaReactionGroup = {
  emoji: string;
  count: number;
  /** Display names, for the reaction tooltip. */
  users: string[];
  mine: boolean;
};

/** The compact preview of a quoted message shown above a reply. */
export type WaQuoted = {
  id: string;
  kind: WaMessageKindName;
  body: string;
  senderId: string | null;
  senderName: string;
  deleted: boolean;
};

export type WaMessage = {
  id: string;
  chatId: string;
  kind: WaMessageKindName;
  body: string;
  createdAt: string;
  editedAt: string | null;
  /** Deleted for everyone — body and attachments are blanked, row survives. */
  deleted: boolean;
  /** Sent by the viewer. Drives bubble side and whether ticks render at all. */
  mine: boolean;
  sender: WaPerson | null;
  system: WaSystemPayload | null;
  replyTo: WaQuoted | null;
  forwardScore: number;
  attachments: WppSerializedAttachment[];
  reactions: WaReactionGroup[];
  starred: boolean;
  /** Null for messages you didn't send — you never see your own ticks on those. */
  tick: WaTick | null;
  /** Present when `kind` is POLL. */
  poll: WaPollResult | null;
  /** Pinned to the top of the chat, for everyone. */
  pinned: boolean;
  /** Set when the chat had a disappearing timer at send time. */
  expiresAt: string | null;
  /** The viewer was named with `@` — drives the highlight and the badge. */
  mentionsMe: boolean;
  /** Tokens (lowercased, no `@`) that resolved to a real participant. */
  mentionTokens: string[];
};

/** Last-message preview on a chat-list row. */
export type WaChatPreview = {
  id: string;
  kind: WaMessageKindName;
  body: string;
  createdAt: string;
  senderId: string | null;
  senderName: string;
  mine: boolean;
  deleted: boolean;
  system: WaSystemPayload | null;
  tick: WaTick | null;
};

export type WaChatSummary = {
  id: string;
  type: "DIRECT" | "GROUP";
  /** Group subject, or the other person's display name. */
  name: string;
  avatarUrl: string | null;
  /** Present for 1:1 chats only. */
  peer: {
    id: string;
    phone: string | null;
    online: boolean;
    lastSeenAt: string | null;
    about: string | null;
  } | null;
  isSelfChat: boolean;
  lastMessage: WaChatPreview | null;
  lastActivityAt: string;
  unreadCount: number;
  /** Unread messages that named the viewer — the `@` badge on the row. */
  mentionCount: number;
  pinned: boolean;
  archived: boolean;
  /** ISO instant, or null when not muted. */
  mutedUntil: string | null;
  /** Unsent composer text, restored when the chat is reopened. */
  draft: string | null;
  memberCount: number;
  /** False once you've left the group — the chat goes read-only. */
  isMember: boolean;
};

export type WaChatMemberInfo = {
  id: string;
  name: string;
  phone: string | null;
  username: string | null;
  avatarUrl: string | null;
  about: string | null;
  role: "ADMIN" | "MEMBER";
  isMe: boolean;
  online: boolean;
  lastSeenAt: string | null;
};

export type WaChatDetail = WaChatSummary & {
  description: string | null;
  /** Disappearing-messages timer in seconds; null when off. */
  disappearingSeconds: number | null;
  /** Messages pinned to the top of this chat, newest pin first. */
  pinnedMessages: WaMessage[];
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  members: WaChatMemberInfo[];
  myRole: "ADMIN" | "MEMBER";
  onlyAdminsCanSend: boolean;
  onlyAdminsCanEditInfo: boolean;
  /** Only ever sent to admins — it's a capability, not public metadata. */
  inviteUrl: string | null;
  canSend: boolean;
  /** Why `canSend` is false, as a dictionary key. */
  blockedReason: WppKey | null;
  peerBlocked: boolean;
};

export type WaContactItem = {
  id: string;
  name: string;
  phone: string | null;
  username: string | null;
  avatarUrl: string | null;
  about: string | null;
  online: boolean;
  /** Set when a 1:1 chat with this person already exists. */
  chatId: string | null;
  isContact: boolean;
  blocked: boolean;
};

export type WaMe = {
  id: string;
  name: string;
  phone: string;
  /** Public @handle, lowercase and without the "@". Null when unset. */
  username: string | null;
  about: string;
  avatarUrl: string | null;
  locale: "en" | "es";
  theme: "light" | "dark" | "system";
  wallpaper: string;
  lastSeenPrivacy: "EVERYONE" | "CONTACTS" | "NOBODY";
  avatarPrivacy: "EVERYONE" | "CONTACTS" | "NOBODY";
  aboutPrivacy: "EVERYONE" | "CONTACTS" | "NOBODY";
  readReceipts: boolean;
};

export type WaStatusItem = {
  id: string;
  kind: "TEXT" | "IMAGE" | "VIDEO";
  body: string;
  backgroundColor: string | null;
  attachment: WppSerializedAttachment | null;
  createdAt: string;
  expiresAt: string;
  seen: boolean;
  /** Only populated on your own updates — you can't see who viewed someone else's. */
  viewers: { id: string; name: string; avatarUrl: string | null; viewedAt: string }[];
};

/** One person's stack of status updates, as shown in the Status list. */
export type WaStatusGroup = {
  user: WaPerson;
  isMe: boolean;
  items: WaStatusItem[];
  /** Newest first-unseen item, so opening the stack starts in the right place. */
  hasUnseen: boolean;
  latestAt: string;
};

/**
 * WhatsApp's "Message info" screen — who has your message, and who has read it.
 *
 * The timestamps come from the recipients' cursors rather than a per-message
 * receipt, which is the same data `computeTick` uses; the screen and the ticks
 * can therefore never contradict each other.
 */
export type WaMessageInfo = {
  createdAt: string;
  read: { id: string; name: string; avatarUrl: string | null; at: string }[];
  delivered: { id: string; name: string; avatarUrl: string | null; at: string }[];
  /** Everyone the message went to, so "2 of 5 read" is renderable. */
  totalRecipients: number;
};

export type WaSearchHit = {
  message: WaMessage;
  chatId: string;
  chatName: string;
  chatType: "DIRECT" | "GROUP";
  chatAvatarUrl: string | null;
};
