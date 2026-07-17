"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Hash, Plus, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type WorkspaceCard = { id: string; name: string; slug: string };

export function WorkspaceLauncher({
  user,
  workspaces,
}: {
  user: { name: string; email: string };
  workspaces: WorkspaceCard[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not create workspace");
      toast.success("Workspace created");
      router.push(`/w/${data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create workspace");
      setLoading(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-12">
      <header className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#4a154b] text-white">
            <Hash className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Your workspaces</h1>
            <p className="text-sm text-muted-foreground">
              Signed in as {user.name} ({user.email})
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="size-4" /> Sign out
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {workspaces.map((ws) => (
          <Link
            key={ws.id}
            href={`/w/${ws.id}`}
            className="group flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-accent"
          >
            <div className="flex size-11 items-center justify-center rounded-lg bg-[#611f69] text-lg font-bold text-white">
              {ws.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold">{ws.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                Open workspace →
              </p>
            </div>
          </Link>
        ))}

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-3 rounded-lg border border-dashed bg-card/50 p-4 text-left transition-colors hover:border-foreground/30 hover:bg-accent"
        >
          <div className="flex size-11 items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground">
            <Plus className="size-5" />
          </div>
          <div>
            <p className="font-semibold">Create a workspace</p>
            <p className="text-sm text-muted-foreground">Start a new team</p>
          </div>
        </button>
      </div>

      {workspaces.length === 0 && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          You&apos;re not part of any workspace yet — create your first one.
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={createWorkspace}>
            <DialogHeader>
              <DialogTitle>Create a workspace</DialogTitle>
              <DialogDescription>
                Workspaces are where your team communicates. Give yours a name.
              </DialogDescription>
            </DialogHeader>
            <div className="my-4 flex flex-col gap-2">
              <Label htmlFor="ws-name">Workspace name</Label>
              <Input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Inc."
                autoFocus
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={loading || !name.trim()}>
                {loading ? "Creating…" : "Create workspace"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
