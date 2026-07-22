"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import useSWR from "swr";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Trash2, UserMinus, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import type { SidebarMember } from "@/lib/types";

type ChannelMember = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  online: boolean;
  isMe: boolean;
};
type ChannelMembers = {
  isPrivate: boolean;
  createdById: string | null;
  canManage: boolean;
  archived: boolean;
  members: ChannelMember[];
};

export function ChannelMembersDialog({
  channelId,
  workspaceId,
  open,
  onOpenChange,
}: {
  channelId: string;
  workspaceId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { mutate: globalMutate } = useSWRConfig();
  const key = `/api/channels/${channelId}/members`;
  const { data, mutate } = useSWR<ChannelMembers>(open ? key : null);
  const { data: workspaceMembers = [] } = useSWR<SidebarMember[]>(
    open && workspaceId ? `/api/workspaces/${workspaceId}/members` : null,
  );
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [channelBusy, setChannelBusy] = useState(false);

  const inChannel = new Set((data?.members ?? []).map((m) => m.id));
  const canManage = data?.canManage ?? false;

  async function toggleArchive() {
    if (!data) return;
    setChannelBusy(true);
    try {
      const res = await fetch(`/api/channels/${channelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !data.archived }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      await mutate();
      if (workspaceId) {
        void globalMutate(`/api/workspaces/${workspaceId}/channels`);
      }
    } catch {
      toast.error("Could not update the channel");
    } finally {
      setChannelBusy(false);
    }
  }

  async function deleteChannel() {
    if (!confirm("Delete this channel and all its messages? This can't be undone."))
      return;
    setChannelBusy(true);
    try {
      const res = await fetch(`/api/channels/${channelId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      onOpenChange(false);
      if (workspaceId) {
        void globalMutate(`/api/workspaces/${workspaceId}/channels`);
        router.push(`/w/${workspaceId}`);
      }
    } catch {
      toast.error("Could not delete the channel");
    } finally {
      setChannelBusy(false);
    }
  }

  const addable = workspaceMembers
    .filter((m) => !inChannel.has(m.id))
    .filter((m) =>
      `${m.name} ${m.email}`.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 8);

  async function add(userId: string) {
    setBusy(userId);
    try {
      const res = await fetch(key, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not add them");
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add them");
    } finally {
      setBusy(null);
    }
  }

  async function remove(userId: string) {
    setBusy(userId);
    try {
      const res = await fetch(`${key}/${userId}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not remove them");
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove them");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Channel members</DialogTitle>
          <DialogDescription>
            {data
              ? `${data.members.length} ${data.members.length === 1 ? "person" : "people"} in this channel.`
              : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-56 overflow-y-auto">
          {(data?.members ?? []).map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 rounded-md px-1 py-1.5"
            >
              <UserAvatar
                name={m.name}
                image={m.image}
                className="size-7"
                online={m.online}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {m.name}
                  {m.isMe && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      (you)
                    </span>
                  )}
                </span>
              </span>
              {(m.isMe || canManage) && (
                <button
                  type="button"
                  disabled={busy === m.id}
                  onClick={() => remove(m.id)}
                  title={m.isMe ? "Leave channel" : `Remove ${m.name}`}
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-destructive disabled:opacity-50"
                >
                  <UserMinus className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="border-t pt-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Add someone from the workspace…"
          />
          <div className="mt-2 max-h-40 overflow-y-auto">
            {addable.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={busy === m.id}
                onClick={() => add(m.id)}
                className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition hover:bg-accent disabled:opacity-50"
              >
                <UserAvatar name={m.name} image={m.image} className="size-7" />
                <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                <UserPlus className="size-4 text-muted-foreground" />
              </button>
            ))}
            {addable.length === 0 && (
              <p className="px-1 py-2 text-sm text-muted-foreground">
                Everyone in the workspace is already here.
              </p>
            )}
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-2 border-t pt-3">
            <button
              type="button"
              disabled={channelBusy}
              onClick={toggleArchive}
              className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {data?.archived ? (
                <>
                  <ArchiveRestore className="size-4" /> Unarchive
                </>
              ) : (
                <>
                  <Archive className="size-4" /> Archive
                </>
              )}
            </button>
            <button
              type="button"
              disabled={channelBusy}
              onClick={deleteChannel}
              className="ml-auto flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1.5 text-sm text-destructive transition hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
            >
              <Trash2 className="size-4" /> Delete channel
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
