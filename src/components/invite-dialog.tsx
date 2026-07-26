"use client";

import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Copy, RefreshCw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function InviteDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutate } = useSWRConfig();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); // regenerate in-flight (event-driven)
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);

  // Fetch (get-or-create) the active link whenever the dialog opens. The token
  // is a stable, reusable link, so keeping it across open/close is harmless.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Could not create an invite");
        if (!cancelled) setToken(data.token);
      })
      .catch((err: unknown) =>
        toast.error(err instanceof Error ? err.message : "Could not create an invite"),
      );
    return () => {
      cancelled = true;
    };
  }, [open, workspaceId]);

  async function addByEmail(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value || adding) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not add them");
      toast.success(`${data.name} was added to the workspace`);
      setEmail("");
      // Refresh the member list wherever it's shown.
      void mutate(`/api/workspaces/${workspaceId}/members`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add them");
    } finally {
      setAdding(false);
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not reset the link");
      setToken(data.token);
      toast.success("New invite link generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset the link");
    } finally {
      setBusy(false);
    }
  }

  const url =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/invite/${token}`
      : "";

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite people</DialogTitle>
          <DialogDescription>
            Add someone who already has an account by email, or share the invite
            link so anyone can join.
          </DialogDescription>
        </DialogHeader>

        {/* Add an existing account by email */}
        <form onSubmit={addByEmail}>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Add by email
          </label>
          <div className="flex gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@company.com"
              autoComplete="off"
            />
            <Button type="submit" disabled={adding || !email.trim()}>
              <UserPlus className="size-4" /> Add
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            They must already have an account. No account yet? Send them the link
            below.
          </p>
        </form>

        <div className="my-1 h-px bg-border" />

        {/* Shareable invite link */}
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Invite link{" "}
          <span className="font-normal normal-case text-muted-foreground/80">
            (expires in 7 days)
          </span>
        </label>
        <div className="flex gap-2">
          <Input
            readOnly
            value={url || "Generating…"}
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button type="button" onClick={copy} disabled={!token} title="Copy link">
            <Copy className="size-4" />
          </Button>
        </div>
        <button
          type="button"
          onClick={regenerate}
          disabled={busy}
          className="mt-1 inline-flex items-center gap-1.5 self-start text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className="size-3.5" /> Reset link
        </button>
      </DialogContent>
    </Dialog>
  );
}
