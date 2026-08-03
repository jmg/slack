"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  Lock,
  MessageSquare,
  Pencil,
  Settings as SettingsIcon,
  ShieldCheck,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WaAvatar } from "@/components/wpp/wa-avatar";
import { useMe, useT } from "@/components/wpp/i18n-provider";
import { WppLangToggle } from "@/components/wpp/wa-lang-toggle";
import { wppError, wppFetch, wppKeys } from "@/lib/wpp/client";
import {
  WPP_API,
  WPP_THEMES,
  WPP_WALLPAPERS,
  wpp,
  type WallpaperKey,
  type WppTheme,
} from "@/lib/wpp/config";
import { formatPhone } from "@/lib/wpp/phone";
import type { WppKey } from "@/lib/wpp/i18n";
import type { WppSerializedAttachment } from "@/lib/wpp/upload-limits";
import type { WaContactItem, WaMe } from "@/lib/wpp/types";

/**
 * Settings, laid out like WhatsApp Web: a list of sections on the left and the
 * one you picked on the right. On a phone the two are separate screens — same
 * trick as the chat list, where the panel steps aside once something is open.
 *
 * Everything writes through one endpoint (`PATCH /api/wpp/me`) and reads back
 * through SWR rather than the `me` snapshot in context, so an edit is visible to
 * this screen the moment it lands instead of on the next full navigation.
 */

type SectionId = "profile" | "account" | "privacy" | "chats" | "blocked";

const SECTIONS: {
  id: SectionId;
  label: WppKey;
  hint: WppKey;
  icon: typeof UserIcon;
}[] = [
  { id: "profile", label: "settings.profile", hint: "settings.profileHint", icon: UserIcon },
  { id: "account", label: "settings.account", hint: "settings.accountHint", icon: Lock },
  { id: "privacy", label: "settings.privacy", hint: "settings.privacyHint", icon: ShieldCheck },
  { id: "chats", label: "settings.chats", hint: "settings.chatsHint", icon: MessageSquare },
  { id: "blocked", label: "settings.blocked", hint: "settings.blockedHint", icon: Ban },
];

const VISIBILITIES = ["EVERYONE", "CONTACTS", "NOBODY"] as const;
type Visibility = (typeof VISIBILITIES)[number];

const VISIBILITY_LABELS: Record<Visibility, WppKey> = {
  EVERYONE: "settings.visibilityEveryone",
  CONTACTS: "settings.visibilityContacts",
  NOBODY: "settings.visibilityNobody",
};

const THEME_LABELS: Record<WppTheme, WppKey> = {
  light: "settings.themeLight",
  dark: "settings.themeDark",
  system: "settings.themeSystem",
};

const WALLPAPER_LABELS: Record<WallpaperKey, WppKey> = {
  default: "wallpaper.default",
  plain: "wallpaper.plain",
  sage: "wallpaper.sage",
  sand: "wallpaper.sand",
  slate: "wallpaper.slate",
  rose: "wallpaper.rose",
};

/**
 * Theme and wallpaper are resolved server-side and live as attributes on
 * `#wpp-root` (see the `.wpp-root` block in globals.css). Waiting for the PATCH
 * to return before repainting would leave the app on the old colours for the
 * length of a round-trip, which reads as a broken control; writing the
 * attributes here makes the choice instant and `router.refresh()` afterwards
 * re-renders the layout with the very same values, so nothing drifts.
 */
function applyThemeNow(theme: WppTheme): void {
  const root = document.getElementById("wpp-root");
  if (!root) return;
  root.dataset.theme = theme;
  root.classList.toggle(
    "dark",
    theme === "dark" ||
      (theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches),
  );
}

function applyWallpaperNow(wallpaper: string): void {
  const root = document.getElementById("wpp-root");
  if (root) root.dataset.wallpaper = wallpaper;
}

export function SettingsView() {
  const t = useT();
  const me = useMe();
  const router = useRouter();
  const { mutate } = useSWRConfig();

  // Null means "nothing chosen yet": on a phone that's the section list, on a
  // desktop it's the placeholder in the right-hand pane.
  const [section, setSection] = useState<SectionId | null>(null);

  const { data } = useSWR<WaMe>(wppKeys.me, { fallbackData: me });
  const profile = data ?? me;

  async function patchMe(json: Record<string, unknown>): Promise<boolean> {
    try {
      const updated = await wppFetch<WaMe>(wppKeys.me, { method: "PATCH", json });
      await mutate(wppKeys.me, updated, { revalidate: false });
      toast.success(t("settings.saved"));
      // The server layout resolves the locale, theme and wallpaper, so it has to
      // re-render for the choice to survive the next navigation.
      router.refresh();
      return true;
    } catch (err) {
      toast.error(wppError(err, t));
      return false;
    }
  }

  return (
    <div className="flex w-full min-w-0">
      <nav
        aria-label={t("settings.title")}
        className={cn(
          "flex w-full shrink-0 flex-col border-r border-[var(--wa-border)] bg-[var(--wa-panel)] md:w-[24rem] md:max-w-[40%]",
          section && "hidden md:flex",
        )}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 px-4">
          <h1 className="text-xl font-semibold text-[var(--wa-text)]">
            {t("settings.title")}
          </h1>
        </header>

        <div className="flex items-center gap-4 px-4 pb-4">
          <WaAvatar name={profile.name} avatarUrl={profile.avatarUrl} size={64} />
          <div className="min-w-0">
            <p className="truncate text-[17px] text-[var(--wa-text)]">
              {profile.name}
            </p>
            <p className="truncate text-sm text-[var(--wa-text-dim)]">
              {profile.about || t("settings.aboutPlaceholder")}
            </p>
          </div>
        </div>

        <ul className="wa-scroll flex-1 overflow-y-auto border-t border-[var(--wa-border)]">
          {SECTIONS.map(({ id, label, hint, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => setSection(id)}
                aria-current={section === id ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-4 px-4 py-3 text-left transition-colors",
                  section === id
                    ? "bg-[var(--wa-selected)]"
                    : "hover:bg-[var(--wa-hover)]",
                )}
              >
                <Icon className="size-5 shrink-0 text-[var(--wa-text-dim)]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-[var(--wa-text)]">
                    {t(label)}
                  </span>
                  <span className="block truncate text-sm text-[var(--wa-text-dim)]">
                    {t(hint)}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-[var(--wa-text-faint)] md:hidden" />
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div
        className={cn(
          "wa-scroll min-w-0 flex-1 overflow-y-auto bg-[var(--wa-app)]",
          !section && "hidden md:block",
        )}
      >
        {section ? (
          <div className="mx-auto flex max-w-2xl flex-col gap-6 p-4 md:p-8">
            <header className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSection(null)}
                aria-label={t("common.back")}
                className="-ml-2 flex size-9 items-center justify-center rounded-full text-[var(--wa-text-dim)] transition-colors hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)] md:hidden"
              >
                <ChevronLeft className="size-5" />
              </button>
              <h2 className="text-lg font-semibold text-[var(--wa-text)]">
                {t(SECTIONS.find((s) => s.id === section)!.label)}
              </h2>
            </header>

            {section === "profile" && (
              <ProfileSection me={profile} patchMe={patchMe} />
            )}
            {section === "account" && <AccountSection me={profile} />}
            {section === "privacy" && (
              <PrivacySection me={profile} patchMe={patchMe} />
            )}
            {section === "chats" && <ChatsSection me={profile} patchMe={patchMe} />}
            {section === "blocked" && <BlockedSection />}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <SettingsIcon className="size-10 text-[var(--wa-text-faint)]" />
            <p className="text-sm text-[var(--wa-text-dim)]">
              {t("settings.selectSection")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Profile ────────────────────────────────────────────────────────────────

function ProfileSection({
  me,
  patchMe,
}: {
  me: WaMe;
  patchMe: (json: Record<string, unknown>) => Promise<boolean>;
}) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      // Two phases, as everywhere else in this app: the bytes land as a pending
      // attachment first, and the PATCH below is what claims it for the account.
      const form = new FormData();
      form.append("file", file);
      form.append("purpose", "AVATAR");
      const attachment = await wppFetch<WppSerializedAttachment>(
        `${WPP_API}/uploads`,
        { method: "POST", body: form },
      );
      await patchMe({ avatarAttachmentId: attachment.id });
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-col items-center gap-4 py-2">
          <WaAvatar name={me.name} avatarUrl={me.avatarUrl} size={160} />
          <div className="flex flex-wrap items-center justify-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label={t("settings.changePhoto")}
              onChange={(e) => void pickPhoto(e.target.files?.[0])}
            />
            <Button
              size="lg"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="bg-[var(--wa-green-deep)] text-white hover:bg-[var(--wa-green-hover)]"
            >
              {uploading ? t("composer.uploading") : t("settings.changePhoto")}
            </Button>
            {me.avatarUrl && (
              <Button
                size="lg"
                variant="ghost"
                disabled={uploading}
                onClick={() => void patchMe({ avatarAttachmentId: null })}
              >
                {t("settings.removePhoto")}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <InlineField
          label={t("settings.name")}
          value={me.name}
          maxLength={60}
          onSave={(value) => patchMe({ name: value })}
        />
      </Card>

      <Card>
        <InlineField
          label={t("settings.about")}
          value={me.about}
          placeholder={t("settings.aboutPlaceholder")}
          maxLength={139}
          multiline
          onSave={(value) => patchMe({ about: value })}
        />
      </Card>

      <Card>
        <FieldLabel>{t("settings.phone")}</FieldLabel>
        <p className="text-[15px] text-[var(--wa-text)]">{formatPhone(me.phone)}</p>
        <p className="text-xs text-[var(--wa-text-dim)]">
          {t("settings.phoneImmutable")}
        </p>
      </Card>
    </div>
  );
}

/**
 * WhatsApp's pencil-to-edit row: read-only until you ask for the field, which
 * keeps a settings screen from looking like a form you are expected to fill in.
 */
function InlineField({
  label,
  value,
  placeholder,
  maxLength,
  multiline = false,
  onSave,
}: {
  label: string;
  value: string;
  placeholder?: string;
  maxLength: number;
  multiline?: boolean;
  onSave: (value: string) => Promise<boolean>;
}) {
  const t = useT();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  async function commit() {
    const next = draft.trim();
    setSaving(true);
    const ok = await onSave(next);
    setSaving(false);
    if (ok) setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <FieldLabel>{label}</FieldLabel>
          <p className="wa-text text-[15px] text-[var(--wa-text)]">
            {value || (
              <span className="text-[var(--wa-text-dim)]">{placeholder ?? "—"}</span>
            )}
          </p>
        </div>
        <button
          type="button"
          aria-label={`${t("common.edit")} — ${label}`}
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-dim)] transition-colors hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]"
        >
          <Pencil className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        <FieldLabel>{label}</FieldLabel>
      </Label>
      {multiline ? (
        <Textarea
          id={id}
          autoFocus
          value={draft}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
        />
      ) : (
        <Input
          id={id}
          autoFocus
          value={draft}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          className="h-9"
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[var(--wa-text-dim)]">
          {maxLength - draft.length}
        </span>
        <span className="flex gap-2">
          <Button size="lg" variant="ghost" onClick={() => setEditing(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            size="lg"
            disabled={saving}
            onClick={() => void commit()}
            className="bg-[var(--wa-green-deep)] text-white hover:bg-[var(--wa-green-hover)]"
          >
            {saving ? t("common.saving") : t("common.save")}
          </Button>
        </span>
      </div>
    </div>
  );
}

// ── Account ────────────────────────────────────────────────────────────────

function AccountSection({ me }: { me: WaMe }) {
  const t = useT();
  const router = useRouter();
  const currentId = useId();
  const newId = useId();
  const phoneId = useId();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [changing, setChanging] = useState(false);

  const [confirmPhone, setConfirmPhone] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function changePassword() {
    setChanging(true);
    try {
      await wppFetch(`${WPP_API}/me/password`, {
        method: "POST",
        json: { currentPassword: current, newPassword: next },
      });
      setCurrent("");
      setNext("");
      toast.success(t("settings.passwordChanged"));
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setChanging(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      await wppFetch(wppKeys.me, {
        method: "DELETE",
        json: { phone: confirmPhone },
      });
      toast.success(t("settings.deleteAccountDone"));
      router.push(wpp("/login"));
      // The session cookie is gone server-side; refresh so the cached tree that
      // still thinks it is signed in is thrown away with it.
      router.refresh();
    } catch (err) {
      toast.error(wppError(err, t));
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h3 className="text-[15px] font-medium text-[var(--wa-text)]">
          {t("settings.changePassword")}
        </h3>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={currentId}>{t("settings.currentPassword")}</Label>
          <Input
            id={currentId}
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={newId}>{t("settings.newPassword")}</Label>
          <Input
            id={newId}
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            aria-describedby={`${newId}-hint`}
            className="h-9"
          />
          <p id={`${newId}-hint`} className="text-xs text-[var(--wa-text-dim)]">
            {t("auth.passwordHint")}
          </p>
        </div>
        <div className="flex justify-end">
          <Button
            size="lg"
            disabled={changing || !current || next.length < 10}
            onClick={() => void changePassword()}
            className="bg-[var(--wa-green-deep)] text-white hover:bg-[var(--wa-green-hover)]"
          >
            {changing ? t("common.saving") : t("settings.changePassword")}
          </Button>
        </div>
      </Card>

      {/* Deliberately its own block, and last: nothing above it can be reached
          by accident from a control that only deletes a photo. */}
      <div className="flex flex-col gap-3 rounded-lg border border-[var(--destructive)]/40 bg-[var(--wa-panel)] p-4">
        <h3 className="flex items-center gap-2 text-[15px] font-medium text-[var(--destructive)]">
          <Trash2 className="size-4" />
          {t("settings.dangerZone")}
        </h3>
        <p className="text-sm text-[var(--wa-text-dim)]">
          {t("settings.deleteAccountHint")}
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={phoneId}>{t("settings.phone")}</Label>
          <Input
            id={phoneId}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={confirmPhone}
            placeholder={formatPhone(me.phone)}
            onChange={(e) => setConfirmPhone(e.target.value)}
            aria-describedby={`${phoneId}-hint`}
            className="h-9"
          />
          <p id={`${phoneId}-hint`} className="text-xs text-[var(--wa-text-dim)]">
            {t("settings.deleteAccountConfirm")}
          </p>
        </div>
        <div className="flex justify-end">
          <Button
            size="lg"
            variant="destructive"
            disabled={deleting || confirmPhone.trim().length === 0}
            onClick={() => void deleteAccount()}
          >
            {t("settings.deleteAccount")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Privacy ────────────────────────────────────────────────────────────────

function PrivacySection({
  me,
  patchMe,
}: {
  me: WaMe;
  patchMe: (json: Record<string, unknown>) => Promise<boolean>;
}) {
  const t = useT();
  const options = VISIBILITIES.map((value) => ({
    value,
    label: t(VISIBILITY_LABELS[value]),
  }));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <WaSelect
          label={t("settings.lastSeen")}
          value={me.lastSeenPrivacy}
          options={options}
          onChange={(value) => void patchMe({ lastSeenPrivacy: value })}
        />
        <WaSelect
          label={t("settings.profilePhotoPrivacy")}
          value={me.avatarPrivacy}
          options={options}
          onChange={(value) => void patchMe({ avatarPrivacy: value })}
        />
        <WaSelect
          label={t("settings.aboutPrivacy")}
          value={me.aboutPrivacy}
          options={options}
          onChange={(value) => void patchMe({ aboutPrivacy: value })}
        />
      </Card>

      <Card>
        <WaSwitch
          label={t("settings.readReceipts")}
          description={t("settings.readReceiptsHint")}
          checked={me.readReceipts}
          onChange={(checked) => void patchMe({ readReceipts: checked })}
        />
      </Card>
    </div>
  );
}

// ── Chats ──────────────────────────────────────────────────────────────────

function ChatsSection({
  me,
  patchMe,
}: {
  me: WaMe;
  patchMe: (json: Record<string, unknown>) => Promise<boolean>;
}) {
  const t = useT();

  async function chooseTheme(theme: WppTheme) {
    applyThemeNow(theme);
    // Put the old theme back if the server refused it, rather than leaving the
    // screen showing a preference that was never saved.
    if (!(await patchMe({ theme }))) applyThemeNow(me.theme);
  }

  async function chooseWallpaper(wallpaper: WallpaperKey) {
    applyWallpaperNow(wallpaper);
    if (!(await patchMe({ wallpaper }))) applyWallpaperNow(me.wallpaper);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <WaSelect
          label={t("settings.theme")}
          value={me.theme}
          options={WPP_THEMES.map((value) => ({
            value,
            label: t(THEME_LABELS[value]),
          }))}
          onChange={(value) => void chooseTheme(value)}
        />
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <FieldLabel>{t("settings.language")}</FieldLabel>
          <WppLangToggle persist />
        </div>
      </Card>

      <Card>
        <FieldLabel>{t("settings.wallpaper")}</FieldLabel>
        <div
          role="group"
          aria-label={t("settings.wallpaper")}
          className="flex flex-wrap gap-3"
        >
          {(Object.keys(WPP_WALLPAPERS) as WallpaperKey[]).map((key) => {
            const swatch = WPP_WALLPAPERS[key];
            const active = me.wallpaper === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => void chooseWallpaper(key)}
                className="flex w-20 flex-col items-center gap-1.5"
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-14 w-full rounded-lg border-2 transition-colors",
                    active
                      ? "border-[var(--wa-green)]"
                      : "border-[var(--wa-divider)]",
                  )}
                  // Split swatch: the light half and the dark half of the same
                  // wallpaper, so the choice is legible in either theme.
                  style={{
                    background: `linear-gradient(135deg, ${swatch.light} 50%, ${swatch.dark} 50%)`,
                  }}
                />
                <span
                  className={cn(
                    "text-xs",
                    active
                      ? "font-medium text-[var(--wa-green)]"
                      : "text-[var(--wa-text-dim)]",
                  )}
                >
                  {t(WALLPAPER_LABELS[key])}
                </span>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ── Blocked contacts ───────────────────────────────────────────────────────

function BlockedSection() {
  const t = useT();
  const { mutate } = useSWRConfig();
  // Both list endpoints answer `{ contacts: [...] }` — blocked accounts are
  // ordinary contact items that happen to carry `blocked: true`.
  const { data, isLoading } = useSWR<{ contacts: WaContactItem[] }>(wppKeys.blocks);
  const blocked = data?.contacts ?? [];

  async function unblock(contact: WaContactItem) {
    try {
      await wppFetch(wppKeys.blocks, {
        method: "POST",
        json: { userId: contact.id, blocked: false },
      });
      void mutate(wppKeys.blocks);
      void mutate(wppKeys.contacts);
      void mutate(wppKeys.chats);
      toast.success(t("chatMenu.unblocked", { name: contact.name }));
    } catch (err) {
      toast.error(wppError(err, t));
    }
  }

  if (!isLoading && blocked.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Ban className="size-8 text-[var(--wa-text-faint)]" />
          <p className="text-sm text-[var(--wa-text-dim)]">
            {t("settings.blockedEmpty")}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <ul className="-mx-2 flex flex-col">
        {blocked.map((contact) => (
          <li
            key={contact.id}
            className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--wa-hover)]"
          >
            <WaAvatar name={contact.name} avatarUrl={contact.avatarUrl} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-[var(--wa-text)]">
                {contact.name || t("common.unknownContact")}
              </span>
              {contact.phone && (
                <span className="block truncate text-xs text-[var(--wa-text-dim)]">
                  {formatPhone(contact.phone)}
                </span>
              )}
            </span>
            <Button size="sm" variant="ghost" onClick={() => void unblock(contact)}>
              {t("chatMenu.unblock")}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── Small shared pieces ────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg bg-[var(--wa-panel)] p-4 shadow-sm">
      {children}
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-xs font-medium tracking-wide text-[var(--wa-text-dim)] uppercase">
      {children}
    </span>
  );
}

/**
 * There is no `Select` in `components/ui`, and a native `<select>` is the right
 * answer here anyway: it is keyboard- and screen-reader-complete for free, and
 * on a phone it opens the platform picker instead of a bespoke popup.
 */
function WaSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        <FieldLabel>{label}</FieldLabel>
      </Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-9 w-full rounded-lg border border-[var(--wa-divider)] bg-[var(--wa-panel)] px-2.5 text-sm text-[var(--wa-text)] outline-none focus-visible:border-[var(--wa-green)] focus-visible:ring-3 focus-visible:ring-[var(--wa-green)]/30"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * A toggle, built from a button rather than a checkbox so the knob can animate.
 * `role="switch"` plus `aria-checked` is what makes that button announce as a
 * switch; the label is wired with `aria-labelledby` because a `<label for>` only
 * binds to form controls, which a `<button>` is not.
 */
function WaSwitch({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <span id={`${id}-label`} className="block text-sm text-[var(--wa-text)]">
          {label}
        </span>
        {description && (
          <p id={`${id}-hint`} className="mt-0.5 text-xs text-[var(--wa-text-dim)]">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-hint` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-[var(--wa-green)]/40 disabled:opacity-50",
          checked ? "bg-[var(--wa-green)]" : "bg-[var(--wa-divider)]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-all",
            checked ? "left-[1.375rem]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}
