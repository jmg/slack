"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { Check, X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { WaAvatar } from "@/components/wpp/wa-avatar";
import { useT } from "@/components/wpp/i18n-provider";
import { wppError, wppFetch, wppKeys } from "@/lib/wpp/client";
import { wpp } from "@/lib/wpp/config";
import type { WaContactItem } from "@/lib/wpp/types";

/**
 * Create a group in WhatsApp's two steps: pick people, then name it.
 *
 * The two-step flow isn't decoration — a group needs a subject, and asking for
 * it after the participants are chosen is what makes "Weekend trip" obvious to
 * type instead of an empty field staring at you first.
 */
export function NewGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const router = useRouter();
  const { mutate } = useSWRConfig();

  const [step, setStep] = useState<"people" | "details">("people");
  const [selected, setSelected] = useState<WaContactItem[]>([]);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const { data } = useSWR<{ contacts: WaContactItem[] }>(
    open ? wppKeys.contacts : null,
  );
  const contacts = data?.contacts ?? [];

  function reset() {
    setStep("people");
    setSelected([]);
    setSubject("");
    setDescription("");
  }

  function toggle(contact: WaContactItem) {
    setSelected((current) =>
      current.some((c) => c.id === contact.id)
        ? current.filter((c) => c.id !== contact.id)
        : [...current, contact],
    );
  }

  async function create() {
    setSaving(true);
    try {
      const chat = await wppFetch<{ id: string }>(wppKeys.chats, {
        method: "POST",
        json: {
          type: "GROUP",
          subject: subject.trim(),
          description: description.trim() || undefined,
          memberIds: selected.map((c) => c.id),
        },
      });
      void mutate(wppKeys.chats);
      onOpenChange(false);
      reset();
      router.push(wpp(`/chats/${chat.id}`));
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("group.newTitle")}</DialogTitle>
          <DialogDescription>
            {step === "people"
              ? t("group.pickParticipants")
              : t("group.detailsHint")}
          </DialogDescription>
        </DialogHeader>

        {step === "people" ? (
          <>
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selected.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => toggle(contact)}
                    className="flex items-center gap-1 rounded-full bg-[var(--wa-app)] py-0.5 pr-2 pl-0.5 text-xs text-[var(--wa-text)]"
                  >
                    <WaAvatar name={contact.name} avatarUrl={contact.avatarUrl} size={20} />
                    {contact.name}
                    <X className="size-3 text-[var(--wa-text-dim)]" />
                  </button>
                ))}
              </div>
            )}

            <div className="wa-scroll max-h-72 overflow-y-auto">
              {contacts.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--wa-text-dim)]">
                  {t("newChat.noContacts")}
                </p>
              ) : (
                <ul>
                  {contacts.map((contact) => {
                    const picked = selected.some((c) => c.id === contact.id);
                    return (
                      <li key={contact.id}>
                        <button
                          type="button"
                          onClick={() => toggle(contact)}
                          aria-pressed={picked}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--wa-hover)]"
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
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-group-subject">{t("group.subject")}</Label>
              <Input
                id="wa-group-subject"
                autoFocus
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t("group.subjectPlaceholder")}
                maxLength={100}
                className="h-10"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wa-group-description">
                {t("group.description")}{" "}
                <span className="font-normal text-[var(--wa-text-dim)]">
                  ({t("common.optional")})
                </span>
              </Label>
              <Textarea
                id="wa-group-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("group.descriptionPlaceholder")}
                maxLength={512}
              />
            </div>
            <p className="text-xs text-[var(--wa-text-dim)]">
              {t("group.selected", { count: selected.length })}
            </p>
          </div>
        )}

        <DialogFooter>
          {step === "people" ? (
            <Button
              disabled={selected.length === 0}
              onClick={() => setStep("details")}
              className="bg-[var(--wa-green-deep)] text-white hover:bg-[var(--wa-green-hover)]"
            >
              {t("common.next")}
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep("people")}>
                {t("common.back")}
              </Button>
              <Button
                disabled={saving || subject.trim().length === 0}
                onClick={() => void create()}
                className="bg-[var(--wa-green-deep)] text-white hover:bg-[var(--wa-green-hover)]"
              >
                {saving ? t("common.saving") : t("group.create")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
