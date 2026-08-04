/**
 * Shape of the frames pushed over the WhatsApp SSE stream.
 *
 * Dependency-free so the client hook and the server bus can share it without
 * the browser importing `server-only` code.
 *
 * Like the Slack half, these are *signals*, not payloads: they name what
 * changed so the client can revalidate exactly the affected SWR key. Message
 * payloads are per-viewer (ticks, saved contact aliases, `starred`), so pushing
 * one verbatim would be wrong for everyone but the sender — the authorized GET
 * re-serializes it for whoever asks.
 *
 * `typing` is the one exception: it carries its data inline because there is no
 * endpoint behind it. Nothing about a keystroke is worth a database row.
 */
export type WppEvent =
  /** The chat list changed: new chat, new last message, unread, pin/archive. */
  | { kind: "chats" }
  /** New/edited/deleted message, or a reaction, inside one chat. */
  | { kind: "messages"; chatId: string }
  /** Chat metadata or participants changed (subject, admins, someone left). */
  | { kind: "chat"; chatId: string }
  /** Read/delivery cursors moved — repaint ticks without refetching messages. */
  | { kind: "receipts"; chatId: string }
  /** Someone is typing. Lapses on its own after TYPING_TTL_MS. */
  | { kind: "typing"; chatId: string; userId: string; name: string }
  /** Someone came online or went away. */
  | { kind: "presence" }
  /** Contacts or blocks changed. */
  | { kind: "contacts" }
  /** A status update was posted, viewed or deleted. */
  | { kind: "status" };
