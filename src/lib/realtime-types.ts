/**
 * Shape of the messages pushed over the workspace SSE stream. Kept in its own
 * dependency-free module so the client hook and the server bus can share it
 * without the client importing any `server-only` code.
 *
 * Events are deliberately *signals*, not payloads: they name what changed so the
 * client can revalidate exactly the affected SWR key. The message payload is
 * per-user (`reactedByMe`, mention highlighting), so pushing it verbatim would be
 * wrong — the authorized GET re-serializes it for whoever asks.
 */
export type WorkspaceEvent =
  | { kind: "message"; channelId?: string; conversationId?: string }
  | {
      kind: "thread";
      parentId: string;
      channelId?: string;
      conversationId?: string;
    }
  | { kind: "channels" }
  | { kind: "conversations" }
  | { kind: "members" }
  | { kind: "channelMembers"; channelId: string };
