"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import {
  Ban,
  Check,
  Copy,
  LogOut,
  MessageSquare,
  MoreVertical,
  Pencil,
  RefreshCw,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WaAvatar } from "@/components/wpp/wa-avatar";
import { useT, useWppLocale } from "@/components/wpp/i18n-provider";
import { wppError, wppFetch, wppKeys } from "@/lib/wpp/client";
import { MAX_GROUP_MEMBERS, WPP_API, wpp } from "@/lib/wpp/config";
import { intlLocale, type WppLocale } from "@/lib/wpp/i18n";
import { formatPresence } from "@/lib/wpp/format";
import { formatPhone } from "@/lib/wpp/phone";
import type { WppSerializedAttachment } from "@/lib/wpp/upload-limits";
import type {
  WaChatDetail,
  WaChatMemberInfo,
  WaContactItem,
} from "@/lib/wpp/types";

/**
 * The right-hand drawer the conversation opens: group info, or — for a 1:1 —
 * contact info. One component rather than two because the two panels are the
 * same list of the same things about the same chat; only which of them exist
 * differs, and that is exactly what `type` already tells us.
 *
 * Every write here is also re-authorised server-side. What the panel decides is
 * only what to *show*: an editable field the API would reject is worse than a
 * read-only one, so `isMember`, `myRole` and `onlyAdminsCanEditInfo` gate the
 * controls the same way the route handlers gate the requests.
 */
export function GroupInfoPanel({
  chatId,
  onClose,
}: {
  chatId: string;
  onClose: () => void;
}): React.ReactElement {
  const t = useT();
  const locale = useWppLocale();
  const router = useRouter();
  const { mutate } = useSWRConfig();

  const { data: chat, isLoading } = useSWR<WaChatDetail>(wppKeys.chat(chatId));

  const iconRef = useRef<HTMLInputElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isGroup = chat?.type === "GROUP";
  const isMember = chat?.isMember ?? false;
  const isAdmin = isMember && chat?.myRole === "ADMIN";
  const canEditInfo =
    isGroup && isMember && (isAdmin || chat?.onlyAdminsCanEditInfo === false);

  async function patchChat(json: Record<string, unknown>): Promise<boolean> {
    try {
      const updated = await wppFetch<WaChatDetail>(wppKeys.chat(chatId), {
        method: "PATCH",
        json,
      });
      await mutate(wppKeys.chat(chatId), updated, { revalidate: false });
      void mutate(wppKeys.chats);
      return true;
    } catch (err) {
      toast.error(wppError(err, t));
      return false;
    }
  }

  async function pickIcon(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("purpose", "GROUP_ICON");
      const attachment = await wppFetch<WppSerializedAttachment>(
        `${WPP_API}/uploads`,
        { method: "POST", body: form },
      );
      await patchChat({ iconAttachmentId: attachment.id });
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setBusy(false);
      if (iconRef.current) iconRef.current.value = "";
    }
  }

  async function copyInvite() {
    if (!chat?.inviteUrl) return;
    try {
      // Absolute, because the link leaves the app: a bare path is useless in a
      // message somewhere else.
      await navigator.clipboard.writeText(
        `${window.location.origin}${chat.inviteUrl}`,
      );
      toast.success(t("group.inviteLinkCopied"));
    } catch (err) {
      toast.error(wppError(err, t));
    }
  }

  async function resetInvite() {
    setBusy(true);
    try {
      await wppFetch(`${wppKeys.chat(chatId)}/invite`, { method: "POST" });
      void mutate(wppKeys.chat(chatId));
      toast.success(t("group.resetLinkDone"));
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function exitGroup() {
    if (!chat || !window.confirm(t("group.exitConfirm", { name: chat.name }))) {
      return;
    }
    setBusy(true);
    try {
      await wppFetch(`${wppKeys.chat(chatId)}/leave`, { method: "POST" });
      void mutate(wppKeys.chat(chatId));
      void mutate(wppKeys.chats);
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function deleteChat() {
    if (!window.confirm(t("chatMenu.deleteConfirm"))) return;
    setBusy(true);
    try {
      await wppFetch(wppKeys.chat(chatId), { method: "DELETE" });
      void mutate(wppKeys.chats);
      void mutate(wppKeys.archived);
      onClose();
      router.push(wpp("/chats"));
    } catch (err) {
      toast.error(wppError(err, t));
      setBusy(false);
    }
  }

  async function toggleBlock() {
    if (!chat?.peer) return;
    if (
      !chat.peerBlocked &&
      !window.confirm(t("chatMenu.blockConfirm", { name: chat.name }))
    ) {
      return;
    }
    setBusy(true);
    try {
      await wppFetch(wppKeys.blocks, {
        method: "POST",
        json: { userId: chat.peer.id, blocked: !chat.peerBlocked },
      });
      void mutate(wppKeys.chat(chatId));
      void mutate(wppKeys.blocks);
      void mutate(wppKeys.contacts);
      toast.success(
        t(chat.peerBlocked ? "chatMenu.unblocked" : "chatMenu.blocked", {
          name: chat.name,
        }),
      );
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside
      aria-label={t(isGroup ? "group.info" : "chatMenu.contactInfo")}
      className="flex h-full w-full shrink-0 flex-col border-l border-[var(--wa-border)] bg-[var(--wa-panel)] md:w-[26rem]"
    >
      <header className="flex h-14 shrink-0 items-center gap-4 px-4">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="-ml-2 flex size-9 items-center justify-center rounded-full text-[var(--wa-text-dim)] transition-colors hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]"
        >
          <X className="size-5" />
        </button>
        <h2 className="text-base font-medium text-[var(--wa-text)]">
          {t(isGroup ? "group.info" : "chatMenu.contactInfo")}
        </h2>
      </header>

      <div className="wa-scroll flex-1 overflow-y-auto bg-[var(--wa-app)]">
        {!chat ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--wa-text-dim)]">
            {isLoading ? t("common.loading") : t("error.chatNotFound")}
          </p>
        ) : (
          <div className="flex flex-col gap-3 pb-8">
            {/* Identity */}
            <PanelCard className="items-center py-6 text-center">
              <WaAvatar
                name={chat.name}
                avatarUrl={chat.avatarUrl}
                group={isGroup}
                size={160}
              />
              {isGroup && canEditInfo && (
                <>
                  <input
                    ref={iconRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    aria-label={t("settings.changePhoto")}
                    onChange={(e) => void pickIcon(e.target.files?.[0])}
                  />
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => iconRef.current?.click()}
                    >
                      {t("settings.changePhoto")}
                    </Button>
                    {chat.avatarUrl && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void patchChat({ iconAttachmentId: null })}
                      >
                        {t("settings.removePhoto")}
                      </Button>
                    )}
                  </div>
                </>
              )}

              {isGroup ? (
                <EditableText
                  label={t("group.subject")}
                  value={chat.name}
                  maxLength={100}
                  editable={!!canEditInfo}
                  onSave={(value) => patchChat({ subject: value })}
                  className="text-xl font-medium text-[var(--wa-text)]"
                  align="center"
                />
              ) : (
                <p className="text-xl font-medium text-[var(--wa-text)]">
                  {chat.name || t("common.deletedAccount")}
                </p>
              )}

              <p className="text-sm text-[var(--wa-text-dim)]">
                {isGroup
                  ? t("group.participants", { count: chat.memberCount })
                  : chat.peer
                    ? (formatPresence(chat.peer, locale, t) ??
                      (chat.peer.phone ? formatPhone(chat.peer.phone) : ""))
                    : ""}
              </p>
            </PanelCard>

            {/* Description / about */}
            {isGroup ? (
              <PanelCard>
                <PanelLabel>{t("group.description")}</PanelLabel>
                <EditableText
                  label={t("group.description")}
                  value={chat.description ?? ""}
                  placeholder={t("group.descriptionPlaceholder")}
                  maxLength={512}
                  multiline
                  editable={!!canEditInfo}
                  onSave={(value) => patchChat({ description: value || null })}
                  className="wa-text text-sm text-[var(--wa-text)]"
                />
                <p className="pt-2 text-xs text-[var(--wa-text-dim)]">
                  {chat.createdBy &&
                    `${t("group.createdBy", { name: chat.createdBy.name })} · `}
                  {t("group.createdOn", {
                    date: formatLongDate(chat.createdAt, locale),
                  })}
                </p>
              </PanelCard>
            ) : (
              chat.peer && (
                <PanelCard>
                  <PanelLabel>{t("settings.about")}</PanelLabel>
                  <p className="wa-text text-sm text-[var(--wa-text)]">
                    {chat.peer.about || (
                      <span className="text-[var(--wa-text-dim)]">
                        {t("settings.aboutPlaceholder")}
                      </span>
                    )}
                  </p>
                  {chat.peer.phone && (
                    <>
                      <PanelLabel>{t("settings.phone")}</PanelLabel>
                      <p className="text-sm text-[var(--wa-text)]">
                        {formatPhone(chat.peer.phone)}
                      </p>
                    </>
                  )}
                </PanelCard>
              )
            )}

            {/* Group settings — always admin-only, even when anyone may edit
                the name: a member must not be able to grant themselves the
                right to post. */}
            {isGroup && isAdmin && (
              <PanelCard>
                <PanelLabel>{t("group.settings")}</PanelLabel>
                <PanelSwitch
                  label={t("group.onlyAdminsCanSend")}
                  checked={chat.onlyAdminsCanSend}
                  disabled={busy}
                  onChange={(checked) =>
                    void patchChat({ onlyAdminsCanSend: checked })
                  }
                />
                <PanelSwitch
                  label={t("group.onlyAdminsCanEditInfo")}
                  checked={chat.onlyAdminsCanEditInfo}
                  disabled={busy}
                  onChange={(checked) =>
                    void patchChat({ onlyAdminsCanEditInfo: checked })
                  }
                />
              </PanelCard>
            )}

            {/* The invite link is only ever sent to admins, so its presence in
                the payload is the permission check. */}
            {chat.inviteUrl && (
              <PanelCard>
                <PanelLabel>{t("group.inviteLink")}</PanelLabel>
                <p className="truncate rounded-md bg-[var(--wa-app)] px-2 py-1.5 text-xs text-[var(--wa-link)]">
                  {chat.inviteUrl}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" onClick={() => void copyInvite()}>
                    <Copy />
                    {t("common.copy")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void resetInvite()}
                  >
                    <RefreshCw />
                    {t("group.resetLink")}
                  </Button>
                </div>
              </PanelCard>
            )}

            {/* Participants */}
            {isGroup && (
              <PanelCard>
                <div className="flex items-center justify-between gap-2">
                  <PanelLabel>
                    {t("group.participants", { count: chat.members.length })}
                  </PanelLabel>
                  {isAdmin && chat.members.length < MAX_GROUP_MEMBERS && (
                    <Button size="sm" variant="ghost" onClick={() => setAddOpen(true)}>
                      <UserPlus />
                      {t("group.addParticipants")}
                    </Button>
                  )}
                </div>
                <ul className="-mx-2 flex flex-col">
                  {chat.members.map((member) => (
                    <MemberRow
                      key={member.id}
                      chatId={chatId}
                      member={member}
                      canManage={!!isAdmin && !member.isMe}
                    />
                  ))}
                </ul>
              </PanelCard>
            )}

            {/* Destructive actions, last and on their own. */}
            <PanelCard>
              {!isGroup && chat.peer && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void toggleBlock()}
                  className="justify-start text-[var(--destructive)] hover:bg-[var(--destructive)]/10"
                >
                  <Ban />
                  {t(chat.peerBlocked ? "chatMenu.unblock" : "chatMenu.block")}
                </Button>
              )}
              {isGroup && isMember && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void exitGroup()}
                  className="justify-start text-[var(--destructive)] hover:bg-[var(--destructive)]/10"
                >
                  <LogOut />
                  {t("group.exit")}
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void deleteChat()}
                className="justify-start text-[var(--destructive)] hover:bg-[var(--destructive)]/10"
              >
                <Trash2 />
                {t(isGroup ? "group.deleteChat" : "chatMenu.deleteChat")}
              </Button>
            </PanelCard>
          </div>
        )}
      </div>

      {chat && isGroup && (
        <AddParticipantsDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          chatId={chatId}
          existingIds={chat.members.map((m) => m.id)}
          remainingSlots={MAX_GROUP_MEMBERS - chat.members.length}
        />
      )}
    </aside>
  );
}

// ── Participants ───────────────────────────────────────────────────────────

function MemberRow({
  chatId,
  member,
  canManage,
}: {
  chatId: string;
  member: WaChatMemberInfo;
  canManage: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const { mutate } = useSWRConfig();

  async function setRole(role: "ADMIN" | "MEMBER") {
    try {
      await wppFetch(`${wppKeys.chat(chatId)}/members/${member.id}`, {
        method: "PATCH",
        json: { role },
      });
      void mutate(wppKeys.chat(chatId));
    } catch (err) {
      toast.error(wppError(err, t));
    }
  }

  async function remove() {
    if (!window.confirm(t("group.removeConfirm", { name: member.name }))) return;
    try {
      await wppFetch(`${wppKeys.chat(chatId)}/members/${member.id}`, {
        method: "DELETE",
      });
      void mutate(wppKeys.chat(chatId));
      void mutate(wppKeys.chats);
    } catch (err) {
      toast.error(wppError(err, t));
    }
  }

  async function message() {
    try {
      // The 1:1 chat may not exist yet; POST /chats is idempotent for a pair.
      const chat = await wppFetch<{ id: string }>(wppKeys.chats, {
        method: "POST",
        json: { userId: member.id },
      });
      void mutate(wppKeys.chats);
      router.push(wpp(`/chats/${chat.id}`));
    } catch (err) {
      toast.error(wppError(err, t));
    }
  }

  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--wa-hover)]">
      <WaAvatar
        name={member.name}
        avatarUrl={member.avatarUrl}
        size={40}
        online={member.online}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-[var(--wa-text)]">
          {member.isMe ? t("common.you") : member.name || t("common.unknownContact")}
        </span>
        <span className="block truncate text-xs text-[var(--wa-text-dim)]">
          {member.about || (member.phone ? formatPhone(member.phone) : "")}
        </span>
      </span>

      {member.role === "ADMIN" && (
        <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--wa-green)_18%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[var(--wa-green)]">
          {t("group.admin")}
        </span>
      )}

      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={t("group.participantActions", { name: member.name })}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-dim)] transition-colors hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]"
              />
            }
          >
            <MoreVertical className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => void message()}>
              <MessageSquare />
              {t("group.messageParticipant")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                void setRole(member.role === "ADMIN" ? "MEMBER" : "ADMIN")
              }
            >
              <Check />
              {t(member.role === "ADMIN" ? "group.revokeAdmin" : "group.makeAdmin")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => void remove()}>
              <Trash2 />
              {t("group.removeParticipant")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

function AddParticipantsDialog({
  open,
  onOpenChange,
  chatId,
  existingIds,
  remainingSlots,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
  existingIds: string[];
  remainingSlots: number;
}) {
  const t = useT();
  const { mutate } = useSWRConfig();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { data } = useSWR<{ contacts: WaContactItem[] }>(
    open ? wppKeys.contacts : null,
  );
  const candidates = (data?.contacts ?? []).filter(
    (contact) => !existingIds.includes(contact.id) && !contact.blocked,
  );

  async function add() {
    setSaving(true);
    try {
      await wppFetch(`${wppKeys.chat(chatId)}/members`, {
        method: "POST",
        json: { userIds: selected },
      });
      void mutate(wppKeys.chat(chatId));
      void mutate(wppKeys.chats);
      onOpenChange(false);
      setSelected([]);
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setSaving(false);
    }
  }

  /**
   * Both dismiss paths land here: Escape and the overlay come through the
   * Dialog's own `onOpenChange`, while the footer's Cancel calls the parent prop
   * directly and would otherwise leave the selection behind for the next time
   * the dialog is opened.
   */
  function close() {
    onOpenChange(false);
    setSelected([]);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("group.addParticipants")}</DialogTitle>
        </DialogHeader>

        <div className="wa-scroll max-h-72 overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--wa-text-dim)]">
              {t("group.everyoneAlreadyIn")}
            </p>
          ) : (
            <ul>
              {candidates.map((contact) => {
                const picked = selected.includes(contact.id);
                return (
                  <li key={contact.id}>
                    <button
                      type="button"
                      aria-pressed={picked}
                      // A full group has to refuse the next tick rather than
                      // let the server reject the whole batch.
                      disabled={!picked && selected.length >= remainingSlots}
                      onClick={() =>
                        setSelected((current) =>
                          picked
                            ? current.filter((id) => id !== contact.id)
                            : [...current, contact.id],
                        )
                      }
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--wa-hover)] disabled:opacity-50"
                    >
                      <WaAvatar
                        name={contact.name}
                        avatarUrl={contact.avatarUrl}
                        size={40}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-[var(--wa-text)]">
                        {contact.name}
                      </span>
                      <span
                        className={
                          picked
                            ? "flex size-5 items-center justify-center rounded-full bg-[var(--wa-green)] text-[var(--wa-green-ink)]"
                            : "size-5 rounded-full border border-[var(--wa-divider)]"
                        }
                      >
                        {picked && <Check className="size-3.5" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={saving || selected.length === 0}
            onClick={() => void add()}
            className="bg-[var(--wa-green-deep)] text-white hover:bg-[var(--wa-green-hover)]"
          >
            {saving ? t("group.adding") : t("common.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Small pieces ───────────────────────────────────────────────────────────

/** "3 March 2025" — the one date on this panel that is never relative. */
function formatLongDate(iso: string, locale: WppLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function PanelCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-2 bg-[var(--wa-panel)] px-4 py-3 shadow-sm",
        className,
      )}
    >
      {children}
    </section>
  );
}

function PanelLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium tracking-wide text-[var(--wa-text-dim)] uppercase">
      {children}
    </span>
  );
}

/**
 * Read-only text that turns into a field when you have the right to change it.
 * `editable` is passed rather than inferred so the caller keeps the permission
 * logic in one place.
 */
function EditableText({
  label,
  value,
  placeholder,
  maxLength,
  multiline = false,
  editable,
  onSave,
  className,
  align = "start",
}: {
  label: string;
  value: string;
  placeholder?: string;
  maxLength: number;
  multiline?: boolean;
  editable: boolean;
  onSave: (value: string) => Promise<boolean>;
  className?: string;
  /** Where the pencil sits relative to the text — beside a centred title, at
   *  the end of a left-aligned block. */
  align?: "start" | "center";
}) {
  const t = useT();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const display = value ? (
    <span className={className}>{value}</span>
  ) : (
    <span className="text-sm text-[var(--wa-text-dim)]">{placeholder ?? "—"}</span>
  );

  if (!editing) {
    return (
      <div
        className={cn(
          "flex w-full items-start gap-2",
          align === "center" ? "justify-center" : "justify-between",
        )}
      >
        {display}
        {editable && (
          <button
            type="button"
            aria-label={`${t("common.edit")} — ${label}`}
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-dim)] transition-colors hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 text-left">
      <Label htmlFor={id} className="sr-only">
        {label}
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
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          {t("common.cancel")}
        </Button>
        <Button
          size="sm"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            const ok = await onSave(draft.trim());
            setSaving(false);
            if (ok) setEditing(false);
          }}
          className="bg-[var(--wa-green-deep)] text-white hover:bg-[var(--wa-green-hover)]"
        >
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}

/**
 * The same button-as-switch the settings screen uses. Deliberately duplicated
 * rather than imported from `settings-view.tsx`: this panel ships inside the
 * conversation bundle, and reaching across would drag the whole settings screen
 * in with it for the sake of twenty lines.
 */
function PanelSwitch({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4">
      <span id={id} className="min-w-0 text-sm text-[var(--wa-text)]">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id}
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
