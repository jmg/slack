"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Hash, Lock, Archive } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import type {
  SidebarChannel,
  SidebarConversation,
  SidebarMember,
} from "@/lib/types";

type Item =
  | { kind: "channel"; id: string; label: string; channel: SidebarChannel }
  | { kind: "dm"; id: string; label: string; conv: SidebarConversation }
  | { kind: "person"; id: string; label: string; member: SidebarMember };

export function QuickSwitcher({
  workspaceId,
  channels,
  conversations,
  members,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  channels: SidebarChannel[];
  conversations: SidebarConversation[];
  members: SidebarMember[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { mutate: globalMutate } = useSWRConfig();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const q = query.trim().toLowerCase();
  const matches = (s: string) => s.toLowerCase().includes(q);

  const items: Item[] = [
    ...channels
      .filter((c) => matches(c.name))
      .slice(0, 6)
      .map((c): Item => ({ kind: "channel", id: c.id, label: c.name, channel: c })),
    ...conversations
      .filter((c) => matches(c.name))
      .slice(0, 6)
      .map((c): Item => ({ kind: "dm", id: c.id, label: c.name, conv: c })),
    ...members
      .filter((m) => matches(m.name) || matches(m.email))
      .slice(0, 6)
      .map((m): Item => ({ kind: "person", id: m.id, label: m.name, member: m })),
  ];
  const active = Math.min(selected, Math.max(0, items.length - 1));

  async function activate(item: Item | undefined) {
    if (!item) return;
    onOpenChange(false);
    if (item.kind === "channel") {
      router.push(`/w/${workspaceId}/c/${item.id}`);
    } else if (item.kind === "dm") {
      router.push(`/w/${workspaceId}/d/${item.id}`);
    } else {
      // Open an existing 1:1 with this person, or create one.
      const existing = conversations.find(
        (c) => c.users.length === 1 && c.users[0]?.id === item.id,
      );
      if (existing) {
        router.push(`/w/${workspaceId}/d/${existing.id}`);
        return;
      }
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: item.id }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Could not open conversation");
        void globalMutate(`/api/workspaces/${workspaceId}/conversations`);
        router.push(`/w/${workspaceId}/d/${data.id}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not open conversation");
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="sr-only">
          <DialogTitle>Jump to</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((s) => Math.min(s + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((s) => Math.max(s - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              void activate(items[active]);
            }
          }}
          placeholder="Jump to a channel, DM or person…"
        />
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No matches.
            </p>
          )}
          {items.map((item, idx) => (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              onMouseEnter={() => setSelected(idx)}
              onClick={() => void activate(item)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition",
                idx === active ? "bg-accent" : "hover:bg-accent/60",
              )}
            >
              {item.kind === "channel" ? (
                item.channel.archived ? (
                  <Archive className="size-4 shrink-0 text-muted-foreground" />
                ) : item.channel.isPrivate ? (
                  <Lock className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Hash className="size-4 shrink-0 text-muted-foreground" />
                )
              ) : item.kind === "dm" ? (
                <UserAvatar
                  name={item.conv.users[0]?.name ?? item.label}
                  image={item.conv.users[0]?.image ?? null}
                  className="size-4 rounded"
                />
              ) : (
                <UserAvatar name={item.member.name} image={item.member.image} className="size-4 rounded" />
              )}
              <span className="truncate">{item.label}</span>
              {item.kind === "person" && (
                <span className="ml-auto text-xs text-muted-foreground">Message</span>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
