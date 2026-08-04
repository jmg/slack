"use client";

import { useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Search, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WaAvatar } from "@/components/wpp/wa-avatar";
import { NewGroupDialog } from "@/components/wpp/new-group-dialog";
import { AddContactDialog } from "@/components/wpp/add-contact-dialog";
import { useMe, useT } from "@/components/wpp/i18n-provider";
import { wppError, wppFetch, wppKeys } from "@/lib/wpp/client";
import { formatPhone } from "@/lib/wpp/phone";
import type { WaContactItem } from "@/lib/wpp/types";

/**
 * "New chat": your saved contacts, plus the way to add someone you haven't
 * saved yet.
 *
 * Adding by phone number is the *only* way to reach a new person — there is no
 * directory to browse and no way to enumerate accounts, which is exactly the
 * property WhatsApp has and the reason the API answers "not found" identically
 * for a wrong number and a number with no account.
 */
export function NewChatDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (userId: string) => void | Promise<void>;
}) {
  const t = useT();
  const me = useMe();
  const { mutate } = useSWRConfig();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const { data } = useSWR<{ contacts: WaContactItem[] }>(
    open ? wppKeys.contacts : null,
  );
  const contacts = useMemo(() => data?.contacts ?? [], [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q),
    );
  }, [contacts, query]);

  /** The query looks like a phone number nobody in the list matches. */
  const canAddTyped =
    /^[+0-9][\d\s().-]{6,}$/.test(query.trim()) && filtered.length === 0;

  async function addByPhone() {
    setAdding(true);
    try {
      const contact = await wppFetch<WaContactItem>(wppKeys.contacts, {
        method: "POST",
        json: { phone: query.trim() },
      });
      void mutate(wppKeys.contacts);
      toast.success(t("newChat.added", { name: contact.name }));
      setQuery("");
      await onPick(contact.id);
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("newChat.title")}</DialogTitle>
            <DialogDescription>{t("newChat.addPhoneHint")}</DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--wa-text-dim)]" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("newChat.searchPlaceholder")}
              className="h-10 pl-9"
            />
          </div>

          <div className="wa-scroll -mx-4 max-h-80 overflow-y-auto px-1">
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                setGroupOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--wa-hover)]"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-[var(--wa-green)] text-[var(--wa-green-ink)]">
                <Users className="size-5" />
              </span>
              <span className="text-sm font-medium text-[var(--wa-text)]">
                {t("newChat.newGroup")}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                setAddOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--wa-hover)]"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-[var(--wa-app)] text-[var(--wa-green)]">
                <UserPlus className="size-5" />
              </span>
              <span className="text-sm font-medium text-[var(--wa-text)]">
                {t("newChat.addContact")}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void onPick(me.id)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--wa-hover)]"
            >
              <WaAvatar name={me.name} avatarUrl={me.avatarUrl} size={40} />
              <span className="flex flex-col">
                <span className="text-sm font-medium text-[var(--wa-text)]">
                  {t("newChat.messageYourself")}
                </span>
                <span className="text-xs text-[var(--wa-text-dim)]">
                  {t("newChat.messageYourselfHint")}
                </span>
              </span>
            </button>

            {canAddTyped && (
              <button
                type="button"
                disabled={adding}
                onClick={() => void addByPhone()}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--wa-hover)] disabled:opacity-60"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-[var(--wa-app)] text-[var(--wa-green)]">
                  <UserPlus className="size-5" />
                </span>
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-[var(--wa-text)]">
                    {t("newChat.addByPhone")}
                  </span>
                  <span className="text-xs text-[var(--wa-text-dim)]">
                    {query.trim()}
                  </span>
                </span>
              </button>
            )}

            <p className="px-3 pt-3 pb-1 text-xs font-medium tracking-wide text-[var(--wa-green)] uppercase">
              {t("newChat.contacts", { app: t("app.name") })}
            </p>

            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-[var(--wa-text-dim)]">
                {contacts.length === 0
                  ? t("newChat.noContacts")
                  : t("newChat.noMatches")}
              </p>
            ) : (
              <ul>
                {filtered.map((contact) => (
                  <li key={contact.id}>
                    <button
                      type="button"
                      onClick={() => void onPick(contact.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[var(--wa-hover)]"
                    >
                      <WaAvatar
                        name={contact.name}
                        avatarUrl={contact.avatarUrl}
                        size={40}
                        online={contact.online}
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-[var(--wa-text)]">
                          {contact.name}
                        </span>
                        <span className="truncate text-xs text-[var(--wa-text-dim)]">
                          {contact.about || (contact.phone ? formatPhone(contact.phone) : "")}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
        </DialogContent>
      </Dialog>

      <NewGroupDialog open={groupOpen} onOpenChange={setGroupOpen} />
      <AddContactDialog open={addOpen} onOpenChange={setAddOpen} onAdded={onPick} />
    </>
  );
}
