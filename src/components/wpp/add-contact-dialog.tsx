"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/wpp/i18n-provider";
import { wppError, wppFetch, wppKeys } from "@/lib/wpp/client";
import type { WaContactItem } from "@/lib/wpp/types";

/**
 * Save someone to your address book.
 *
 * The alias is the point of this dialog, and the reason it exists rather than a
 * bare "add by number" row: the name you save someone under is what the whole
 * app shows for them — chat titles, message senders, quoted replies. Without a
 * field for it, every contact added from the UI stayed labelled by their raw
 * phone number forever, since nothing else can set it.
 *
 * You can only add an account that already exists. There is no directory and no
 * way to enumerate numbers, which is why the API answers identically for a
 * mistyped number and one nobody has registered.
 */
export function AddContactDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the new contact's id — the caller usually opens their chat. */
  onAdded?: (userId: string) => void | Promise<void>;
}) {
  const t = useT();
  const { mutate } = useSWRConfig();
  const [phone, setPhone] = useState("");
  const [alias, setAlias] = useState("");
  const [saving, setSaving] = useState(false);

  /** Every dismissal — Cancel, Escape, the overlay, a successful save. */
  function close() {
    onOpenChange(false);
    setPhone("");
    setAlias("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !phone.trim()) return;
    setSaving(true);
    try {
      const contact = await wppFetch<WaContactItem>(wppKeys.contacts, {
        method: "POST",
        json: {
          phone: phone.trim(),
          // Omitted rather than sent empty, so the server keeps whatever alias
          // is already saved when re-adding someone.
          ...(alias.trim() ? { alias: alias.trim() } : {}),
        },
      });
      void mutate(wppKeys.contacts);
      void mutate(wppKeys.chats);
      toast.success(t("newChat.added", { name: contact.name }));
      close();
      await onAdded?.(contact.id);
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("newChat.addPhoneTitle")}</DialogTitle>
            <DialogDescription>{t("newChat.addPhoneHint")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wa-contact-phone">{t("auth.phone")}</Label>
            <Input
              id="wa-contact-phone"
              autoFocus
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+54 11 2345 6789"
              required
              className="h-10"
            />
            <p className="text-xs text-[var(--wa-text-dim)]">{t("auth.phoneHint")}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wa-contact-alias">{t("newChat.aliasLabel")}</Label>
            <Input
              id="wa-contact-alias"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder={t("newChat.aliasPlaceholder")}
              maxLength={60}
              className="h-10"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={saving || !phone.trim()}
              className="bg-[var(--wa-green-deep)] text-white hover:bg-[var(--wa-green-hover)]"
            >
              {saving ? t("common.saving") : t("common.add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
