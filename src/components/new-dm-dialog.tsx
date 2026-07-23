"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
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
  const [selected, setSelected] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);

  const selectedMembers = selected
    .map((id) => members.find((m) => m.id === id))
    .filter((m): m is SidebarMember => Boolean(m));

  const filtered = members.filter(
    (m) =>
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      m.email.toLowerCase().includes(query.toLowerCase()),
  );

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function start() {
    if (selected.length === 0 || starting) return;
    setStarting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not open conversation");
      onOpenChange(false);
      setQuery("");
      setSelected([]);
      void mutate(`/api/workspaces/${workspaceId}/conversations`);
      router.push(`/w/${workspaceId}/d/${data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open conversation");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Direct messages</DialogTitle>
          <DialogDescription>
            Start a conversation with one person — or several for a group.
          </DialogDescription>
        </DialogHeader>

        {selectedMembers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedMembers.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium"
              >
                {m.name}
                <X className="size-3" />
              </button>
            ))}
          </div>
        )}

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
          autoFocus
        />
        <div className="max-h-72 overflow-y-auto">
          {filtered.map((member) => {
            const isSel = selected.includes(member.id);
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => toggle(member.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-accent",
                  isSel && "bg-accent/60",
                )}
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
                {isSel && <Check className="ml-auto size-4 shrink-0" />}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No people found.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={start}
            disabled={selected.length === 0 || starting}
          >
            {starting
              ? "Starting…"
              : selected.length > 1
                ? `Start group (${selected.length})`
                : "Start conversation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
