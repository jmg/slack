"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SidebarMember } from "@/lib/types";

export function NewDmDialog({
  workspaceId,
  members,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  members: SidebarMember[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filtered = members.filter(
    (m) =>
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      m.email.toLowerCase().includes(query.toLowerCase()),
  );

  async function startConversation(userId: string) {
    setPendingId(userId);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not open conversation");
      onOpenChange(false);
      setQuery("");
      // Reflect the new conversation in the sidebar right away; other members
      // get it over SSE.
      void mutate(`/api/workspaces/${workspaceId}/conversations`);
      router.push(`/w/${workspaceId}/d/${data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open conversation");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Direct messages</DialogTitle>
          <DialogDescription>
            Start a conversation with someone in this workspace.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
          autoFocus
        />
        <div className="max-h-72 overflow-y-auto">
          {filtered.map((member) => (
            <button
              key={member.id}
              type="button"
              disabled={pendingId === member.id}
              onClick={() => startConversation(member.id)}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-accent disabled:opacity-60"
            >
              <UserAvatar name={member.name} image={member.image} className="size-8" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {member.name}
                  {member.isMe && (
                    <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {member.email}
                </span>
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No people found.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
