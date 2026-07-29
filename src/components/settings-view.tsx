"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Mail,
  ScrollText,
  Shield,
  UserMinus,
  Sparkles,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { CHAT_THEMES } from "@/lib/themes";

/** Read an image file and re-encode it as a small square avatar data URL. */
async function resizeToAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const scale = Math.max(size / bitmap.width, size / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function SettingsView({
  workspaceId,
  workspaceName,
  isAdmin,
  emailNotifications,
  chatTheme,
  userName,
  userImage,
}: {
  workspaceId: string;
  workspaceName: string;
  isAdmin: boolean;
  emailNotifications: boolean;
  chatTheme: string;
  userName: string;
  userImage: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const b = searchParams.get("billing");
    if (b === "success") toast.success("You're on the Team plan 🎉 thanks!");
    else if (b === "cancel") toast.info("Checkout canceled — no charge was made.");
    if (b) window.history.replaceState(null, "", `/w/${workspaceId}/settings`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(userImage);
  const [avatarBusy, setAvatarBusy] = useState(false);

  async function saveImage(next: string | null) {
    setAvatarBusy(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: next }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      setImage(next);
      router.refresh(); // update the avatar shown in the sidebar/messages
      toast.success(next ? "Photo updated" : "Photo removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update photo");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function onAvatarFile(file: File) {
    try {
      const dataUrl = await resizeToAvatar(file);
      await saveImage(dataUrl);
    } catch {
      toast.error("Could not read that image");
    }
  }
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

        {/* Profile photo */}
        <section className="mt-8 rounded-lg border p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Profile photo
          </h2>
          <div className="mt-4 flex items-center gap-4">
            <UserAvatar name={userName} image={image} className="size-16 rounded-lg" />
            <div className="flex flex-col gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onAvatarFile(f);
                  e.target.value = "";
                }}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={avatarBusy}
                  onClick={() => fileRef.current?.click()}
                >
                  {avatarBusy ? "Saving…" : "Upload photo"}
                </Button>
                {image && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={avatarBusy}
                    onClick={() => saveImage(null)}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                PNG, JPG or WebP — resized to 128×128.
              </p>
            </div>
          </div>
        </section>

        {/* Workspace */}
        <section className="mt-6 rounded-lg border p-5">
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
                    "relative flex items-center gap-2.5 rounded-lg border p-2.5 pr-7 text-left transition hover:bg-muted/50",
                    selected ? "border-foreground ring-1 ring-foreground" : "border-border",
                  )}
                >
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: t.sidebar }}
                  >
                    <span
                      className="size-3 rounded-full"
                      style={{ backgroundColor: t.active }}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {t.label}
                  </span>
                  {selected && <Check className="absolute right-2 top-1/2 size-4 -translate-y-1/2" />}
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

        <BillingSection workspaceId={workspaceId} isAdmin={isAdmin} />

        {isAdmin && <MembersSection workspaceId={workspaceId} />}

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

type BillingInfo = {
  plan: "free" | "team";
  status: string | null;
  currentPeriodEnd: string | null;
  seats: number;
  pricePerSeat: number;
  monthlyTotal: number;
  freeLimit: number;
  configured: boolean;
  isAdmin: boolean;
  hasCustomer: boolean;
};

/** Plan + upgrade/manage. Visible to everyone; buttons are admin-only. */
function BillingSection({ workspaceId, isAdmin }: { workspaceId: string; isAdmin: boolean }) {
  const { data } = useSWR<BillingInfo>(`/api/workspaces/${workspaceId}/billing`);
  const [busy, setBusy] = useState(false);

  async function go(action: "checkout" | "portal") {
    setBusy(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/billing/${action}`, {
        method: "POST",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Something went wrong");
      if (d.url) window.location.href = d.url;
      else setBusy(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  const team = data?.plan === "team";
  return (
    <section className="mt-6 rounded-lg border p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <CreditCard className="size-4" /> Billing
      </h2>
      {!data ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      ) : !data.configured ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Billing isn&apos;t set up on this instance.
        </p>
      ) : (
        <div className="mt-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            {team ? (
              <>
                Team plan
                <span className="rounded-full bg-[#007a5a]/10 px-2 py-0.5 text-xs font-semibold text-[#007a5a]">
                  {data.status ?? "active"}
                </span>
              </>
            ) : (
              "Free plan"
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {team
              ? `$${data.pricePerSeat}/member · ${data.seats} members · about $${data.monthlyTotal}/mo`
              : `${data.seats} of ${data.freeLimit} members used — upgrade for unlimited members, roles & priority support`}
          </p>

          {isAdmin ? (
            <div className="mt-4">
              {team ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => go("portal")}>
                  {busy ? "Opening…" : "Manage billing"}
                </Button>
              ) : (
                <Button size="sm" disabled={busy} onClick={() => go("checkout")}>
                  <Sparkles className="size-4" />{" "}
                  {busy ? "Redirecting…" : `Upgrade to Team — $${data.pricePerSeat}/member/mo`}
                </Button>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Billed monthly per member. Cancel anytime.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Ask a workspace admin to change the plan.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

type WsMember = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: "ADMIN" | "MEMBER";
  isMe: boolean;
  online: boolean;
};

/** Admin-only: promote/demote and remove workspace members. */
function MembersSection({ workspaceId }: { workspaceId: string }) {
  const { data, mutate } = useSWR<WsMember[]>(`/api/workspaces/${workspaceId}/members`);
  const [busy, setBusy] = useState<string | null>(null);

  async function setRole(m: WsMember, role: "ADMIN" | "MEMBER") {
    setBusy(m.id);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Could not update role");
      toast.success(`${m.name} is now ${role === "ADMIN" ? "an admin" : "a member"}`);
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update role");
    } finally {
      setBusy(null);
    }
  }

  async function remove(m: WsMember) {
    if (!confirm(`Remove ${m.name} from this workspace?`)) return;
    setBusy(m.id);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members/${m.id}`, {
        method: "DELETE",
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Could not remove them");
      toast.success(`${m.name} was removed`);
      void mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove them");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-6 rounded-lg border p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <Shield className="size-4" /> Members &amp; roles
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Admins can rename the workspace, invite &amp; remove people, manage roles,
        and delete anyone&apos;s messages.
      </p>
      <div className="mt-3">
        {(!data || data.length === 0) && (
          <p className="text-sm text-muted-foreground">No members yet.</p>
        )}
        {data?.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 border-b py-2 last:border-0"
          >
            <UserAvatar name={m.name} image={m.image} className="size-8" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {m.name}
                {m.isMe && <span className="text-muted-foreground"> (you)</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">{m.email}</p>
            </div>
            <select
              value={m.role}
              disabled={m.isMe || busy === m.id}
              onChange={(e) => setRole(m, e.target.value as "ADMIN" | "MEMBER")}
              className="rounded-md border bg-background px-2 py-1 text-xs disabled:opacity-50"
              title={m.isMe ? "You can't change your own role" : "Change role"}
            >
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
            </select>
            {!m.isMe && (
              <button
                type="button"
                onClick={() => remove(m)}
                disabled={busy === m.id}
                title="Remove from workspace"
                className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                <UserMinus className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
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
