"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import { ArrowLeft, Check, Mail, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CHAT_THEMES } from "@/lib/themes";

export function SettingsView({
  workspaceId,
  workspaceName,
  isAdmin,
  emailNotifications,
  chatTheme,
}: {
  workspaceId: string;
  workspaceName: string;
  isAdmin: boolean;
  emailNotifications: boolean;
  chatTheme: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(workspaceName);
  const [savingName, setSavingName] = useState(false);
  const [emailOn, setEmailOn] = useState(emailNotifications);
  const [savingEmail, setSavingEmail] = useState(false);
  const [theme, setTheme] = useState(chatTheme);
  const [deleting, setDeleting] = useState(false);

  async function deleteAccount() {
    if (
      !confirm(
        "Delete your account? Your profile is scrubbed and you're removed from all workspaces. This can't be undone.",
      )
    )
      return;
    setDeleting(true);
    try {
      const res = await fetch("/api/me", { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Could not delete your account");
      setDeleting(false);
    }
  }

  async function pickTheme(key: string) {
    const previous = theme;
    setTheme(key);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatTheme: key }),
      });
      if (!res.ok) throw new Error();
      router.refresh(); // re-render the layout so the sidebar recolors live
    } catch {
      setTheme(previous);
      toast.error("Could not change the theme");
    }
  }

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

        {/* Appearance */}
        <section className="mt-6 rounded-lg border p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Sidebar theme
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(CHAT_THEMES).map(([key, t]) => {
              const selected = key === theme;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => pickTheme(key)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-2.5 text-left transition hover:bg-muted/50",
                    selected ? "border-foreground ring-1 ring-foreground" : "border-border",
                  )}
                >
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: t.sidebar }}
                  >
                    <span
                      className="size-3.5 rounded-full"
                      style={{ backgroundColor: t.active }}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {t.label}
                  </span>
                  {selected && <Check className="size-4 shrink-0" />}
                </button>
              );
            })}
          </div>
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

        {isAdmin && <AuditSection workspaceId={workspaceId} />}

        {/* Danger zone */}
        <section className="mt-6 rounded-lg border border-destructive/30 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-destructive">
            Danger zone
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Deleting your account scrubs your profile and removes you from all
            workspaces. Your messages remain, shown as &ldquo;Deleted
            user&rdquo;. This can&apos;t be undone.
          </p>
          <button
            type="button"
            onClick={deleteAccount}
            disabled={deleting}
            className="mt-4 rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete my account"}
          </button>
        </section>
      </div>
    </div>
  );
}

type AuditEntry = {
  id: string;
  action: string;
  actor: string;
  createdAt: string;
};

function AuditSection({ workspaceId }: { workspaceId: string }) {
  const { data } = useSWR<AuditEntry[]>(`/api/workspaces/${workspaceId}/audit`);
  return (
    <section className="mt-6 rounded-lg border p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <ScrollText className="size-4" /> Audit log
      </h2>
      <div className="mt-3">
        {(!data || data.length === 0) && (
          <p className="text-sm text-muted-foreground">No recorded activity yet.</p>
        )}
        {data?.map((e) => (
          <div
            key={e.id}
            className="flex items-center gap-3 border-b py-1.5 text-sm last:border-0"
          >
            <span className="font-mono text-xs">{e.action}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {e.actor}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {new Date(e.createdAt).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
