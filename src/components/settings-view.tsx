"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SettingsView({
  workspaceId,
  workspaceName,
  isAdmin,
  emailNotifications,
}: {
  workspaceId: string;
  workspaceName: string;
  isAdmin: boolean;
  emailNotifications: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(workspaceName);
  const [savingName, setSavingName] = useState(false);
  const [emailOn, setEmailOn] = useState(emailNotifications);
  const [savingEmail, setSavingEmail] = useState(false);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success("Workspace renamed");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSavingName(false);
    }
  }

  async function toggleEmail(next: boolean) {
    setEmailOn(next);
    setSavingEmail(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailNotifications: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(next ? "We'll email you about unread messages" : "Email notifications off");
    } catch {
      setEmailOn(!next);
      toast.error("Could not update the setting");
    } finally {
      setSavingEmail(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl p-8">
        <Link
          href={`/w/${workspaceId}`}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to workspace
        </Link>
        <h1 className="text-2xl font-bold">Settings</h1>

        {/* Workspace */}
        <section className="mt-8 rounded-lg border p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Workspace
          </h2>
          <form onSubmit={saveName} className="mt-4 flex flex-col gap-2">
            <Label htmlFor="ws-name">Name</Label>
            <div className="flex gap-2">
              <Input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isAdmin || savingName}
                maxLength={80}
              />
              {isAdmin && (
                <Button type="submit" disabled={savingName || !name.trim() || name === workspaceName}>
                  {savingName ? "Saving…" : "Save"}
                </Button>
              )}
            </div>
            {!isAdmin && (
              <p className="text-xs text-muted-foreground">
                Only workspace admins can change the name.
              </p>
            )}
          </form>
        </section>

        {/* Notifications */}
        <section className="mt-6 rounded-lg border p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Notifications
          </h2>
          <label className="mt-4 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={emailOn}
              disabled={savingEmail}
              onChange={(e) => toggleEmail(e.target.checked)}
              className="mt-1 size-4 accent-[#611f69]"
            />
            <span className="flex flex-col">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Mail className="size-4" /> Email me about unread messages
              </span>
              <span className="text-xs text-muted-foreground">
                When you&apos;re away, we&apos;ll email you about messages you
                haven&apos;t read after a few minutes.
              </span>
            </span>
          </label>
        </section>
      </div>
    </div>
  );
}
