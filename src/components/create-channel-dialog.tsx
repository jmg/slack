"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CreateChannelDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);

  function normalize(value: string) {
    return value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, isPrivate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not create channel");
      onOpenChange(false);
      setName("");
      setDescription("");
      setIsPrivate(false);
      // Show it in the sidebar immediately for the creator; the SSE broadcast
      // handles every other connected member.
      void mutate(`/api/workspaces/${workspaceId}/channels`);
      router.push(`/w/${workspaceId}/c/${data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create channel");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Create a channel</DialogTitle>
            <DialogDescription>
              Channels are where your team communicates around a topic.
            </DialogDescription>
          </DialogHeader>
          <div className="my-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="channel-name">Name</Label>
              <div className="flex items-center rounded-md border px-2 focus-within:ring-1 focus-within:ring-ring">
                <span className="text-muted-foreground">#</span>
                <Input
                  id="channel-name"
                  value={name}
                  onChange={(e) => setName(normalize(e.target.value))}
                  placeholder="marketing"
                  className="border-0 shadow-none focus-visible:ring-0"
                  autoFocus
                  required
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="channel-desc">Description (optional)</Label>
              <Textarea
                id="channel-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this channel about?"
                rows={2}
              />
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="mt-1 size-4 accent-[#611f69]"
              />
              <span className="flex flex-col">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Lock className="size-3.5" /> Make private
                </span>
                <span className="text-xs text-muted-foreground">
                  Only invited members can view this channel.
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? "Creating…" : "Create channel"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
