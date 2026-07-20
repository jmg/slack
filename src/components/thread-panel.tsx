"use client";

import useSWR from "swr";
import { toast } from "sonner";
import { X } from "lucide-react";
import { MessageItem } from "@/components/message-item";
import { MessageComposer } from "@/components/message-composer";
import type { SerializedMessage } from "@/lib/messages";

type ThreadData = { parent: SerializedMessage; replies: SerializedMessage[] };

export function ThreadPanel({
  messageId,
  currentUserId,
  workspaceId,
  onClose,
  onThreadChanged,
}: {
  messageId: string;
  currentUserId: string;
  workspaceId?: string;
  onClose: () => void;
  onThreadChanged: () => void;
}) {
  const key = `/api/messages/${messageId}/thread`;
  const { data, mutate } = useSWR<ThreadData>(key, { refreshInterval: 3000 });

  function patchLocal(updated: SerializedMessage) {
    void mutate((cur) => {
      if (!cur) return cur;
      if (cur.parent.id === updated.id) return { ...cur, parent: updated };
      return {
        ...cur,
        replies: cur.replies.map((r) => (r.id === updated.id ? updated : r)),
      };
    }, { revalidate: false });
  }

  async function toggleReaction(id: string, emoji: string) {
    const res = await fetch(`/api/messages/${id}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    const updated = await res.json().catch(() => null);
    if (!res.ok || !updated) return toast.error("Could not update reaction");
    patchLocal(updated);
  }

  async function editMessage(id: string, body: string) {
    const res = await fetch(`/api/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const updated = await res.json().catch(() => null);
    if (!res.ok || !updated) {
      toast.error(updated?.error ?? "Could not edit message");
      throw new Error("edit failed");
    }
    patchLocal(updated);
  }

  async function deleteMessage(id: string) {
    if (!confirm("Delete this message?")) return;
    const res = await fetch(`/api/messages/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Could not delete message");
    if (id === messageId) {
      onThreadChanged();
      onClose();
      return;
    }
    void mutate(
      (cur) =>
        cur ? { ...cur, replies: cur.replies.filter((r) => r.id !== id) } : cur,
      { revalidate: false },
    );
    onThreadChanged();
  }

  async function sendReply(body: string, attachmentIds: string[]) {
    const res = await fetch(key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, attachmentIds }),
    });
    const reply = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(reply.error ?? "Could not send reply");
      throw new Error("reply failed");
    }
    void mutate(
      (cur) => (cur ? { ...cur, replies: [...cur.replies, reply] } : cur),
      { revalidate: false },
    );
    onThreadChanged();
  }

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div>
          <h3 className="text-[15px] font-bold">Thread</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close thread"
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto py-2">
        {data ? (
          <>
            <MessageItem
              message={data.parent}
              showHeader
              currentUserId={currentUserId}
              onToggleReaction={toggleReaction}
              onEdit={editMessage}
              onDelete={deleteMessage}
              hideThreadIndicator
            />
            <div className="my-2 flex items-center gap-3 px-4">
              <span className="text-xs font-semibold text-muted-foreground">
                {data.replies.length}{" "}
                {data.replies.length === 1 ? "reply" : "replies"}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            {data.replies.map((r) => (
              <MessageItem
                key={r.id}
                message={r}
                showHeader
                currentUserId={currentUserId}
                onToggleReaction={toggleReaction}
                onEdit={editMessage}
                onDelete={deleteMessage}
                hideThreadIndicator
              />
            ))}
          </>
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading…</p>
        )}
      </div>

      <MessageComposer
        placeholder="Reply…"
        onSend={sendReply}
        workspaceId={workspaceId}
      />
    </aside>
  );
}
