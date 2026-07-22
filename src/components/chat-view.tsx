"use client";

import { useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Hash, Lock, Users } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { MessageList } from "@/components/message-list";
import { MessageComposer } from "@/components/message-composer";
import { ThreadPanel } from "@/components/thread-panel";
import { ChannelMembersDialog } from "@/components/channel-members-dialog";
import type { SerializedMessage } from "@/lib/messages";

type IconType = "hash" | "lock" | "dm";

export function ChatView({
  messagesUrl,
  currentUserId,
  workspaceId,
  title,
  subtitle,
  iconType,
  avatar,
  placeholder,
  channelId,
}: {
  messagesUrl: string;
  currentUserId: string;
  workspaceId?: string;
  title: string;
  subtitle?: string;
  iconType: IconType;
  avatar?: { name: string; image: string | null };
  placeholder: string;
  /** Set for channels (not DMs) — enables the members dialog. */
  channelId?: string;
}) {
  // No polling: the workspace SSE stream revalidates this key the instant a
  // message lands, is edited/deleted, or gets a reaction (see useWorkspaceEvents).
  const { data: messages = [], mutate } = useSWR<SerializedMessage[]>(messagesUrl);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const { mutate: globalMutate } = useSWRConfig();

  // Viewing a channel/DM marks it read — on open and as new messages land —
  // then refreshes the sidebar's unread badges.
  const readUrl = messagesUrl.replace(/\/messages$/, "/read");
  const messageCount = messages.length;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await fetch(readUrl, { method: "POST" });
      } catch {
        return; // offline / transient — the next poll will retry
      }
      if (!cancelled && workspaceId) {
        void globalMutate(`/api/workspaces/${workspaceId}/unread`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [readUrl, messageCount, workspaceId, globalMutate]);

  async function sendMessage(body: string, attachmentIds: string[]) {
    const res = await fetch(messagesUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, attachmentIds }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Could not send message");
      throw new Error(data.error ?? "Could not send message");
    }
    await mutate((current = []) => [...current, data], { revalidate: false });
  }

  async function toggleReaction(messageId: string, emoji: string) {
    const res = await fetch(`/api/messages/${messageId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    const updated = await res.json().catch(() => null);
    if (!res.ok || !updated) {
      toast.error("Could not update reaction");
      return;
    }
    await mutate(
      (current = []) => current.map((m) => (m.id === messageId ? updated : m)),
      { revalidate: false },
    );
  }

  async function editMessage(messageId: string, body: string) {
    const res = await fetch(`/api/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const updated = await res.json().catch(() => null);
    if (!res.ok || !updated) {
      toast.error(updated?.error ?? "Could not edit message");
      throw new Error("edit failed");
    }
    await mutate(
      (current = []) => current.map((m) => (m.id === messageId ? updated : m)),
      { revalidate: false },
    );
  }

  async function deleteMessage(messageId: string) {
    if (!confirm("Delete this message?")) return;
    const res = await fetch(`/api/messages/${messageId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete message");
      return;
    }
    if (threadId === messageId) setThreadId(null);
    await mutate((current = []) => current.filter((m) => m.id !== messageId), {
      revalidate: false,
    });
  }

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          {iconType === "dm" && avatar ? (
            <UserAvatar name={avatar.name} image={avatar.image} className="size-6" />
          ) : iconType === "lock" ? (
            <Lock className="size-4 text-muted-foreground" />
          ) : (
            <Hash className="size-4 text-muted-foreground" />
          )}
          <h2 className="text-[15px] font-bold">{title}</h2>
          {subtitle && (
            <>
              <span className="text-border">|</span>
              <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
            </>
          )}
          {channelId && (
            <button
              type="button"
              onClick={() => setMembersOpen(true)}
              title="Channel members"
              className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Users className="size-3.5" />
              Members
            </button>
          )}
        </header>

        <MessageList
          messages={messages}
          currentUserId={currentUserId}
          onToggleReaction={toggleReaction}
          onEdit={editMessage}
          onDelete={deleteMessage}
          onOpenThread={(m) => setThreadId(m.id)}
          emptyState={
            <div className="px-4 pb-6">
              <div className="flex items-center gap-2 text-2xl font-bold">
                {iconType === "dm" && avatar ? (
                  <UserAvatar name={avatar.name} image={avatar.image} />
                ) : (
                  <span className="flex size-10 items-center justify-center rounded-lg bg-muted">
                    {iconType === "lock" ? (
                      <Lock className="size-5" />
                    ) : (
                      <Hash className="size-5" />
                    )}
                  </span>
                )}
                {title}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {iconType === "dm"
                  ? `This is the very beginning of your direct message history with ${title}.`
                  : `This is the very beginning of the ${title} channel.`}
              </p>
            </div>
          }
        />

        <MessageComposer
          placeholder={placeholder}
          onSend={sendMessage}
          workspaceId={workspaceId}
        />
      </div>

      {channelId && (
        <ChannelMembersDialog
          channelId={channelId}
          workspaceId={workspaceId}
          open={membersOpen}
          onOpenChange={setMembersOpen}
        />
      )}

      {threadId && (
        <ThreadPanel
          key={threadId}
          messageId={threadId}
          currentUserId={currentUserId}
          workspaceId={workspaceId}
          onClose={() => setThreadId(null)}
          onThreadChanged={() => mutate()}
        />
      )}
    </div>
  );
}
