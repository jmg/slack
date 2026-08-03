"use client";

import { useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Check, Search } from "lucide-react";
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
import { WaAvatar } from "@/components/wpp/wa-avatar";
import { useT } from "@/components/wpp/i18n-provider";
import { wppError, wppFetch, wppKeys } from "@/lib/wpp/client";
import { WPP_API } from "@/lib/wpp/config";
import type { WaChatSummary, WaMessage } from "@/lib/wpp/types";

/**
 * "Forward to…" — pick any number of chats and send the message on.
 *
 * The server copies the row rather than linking to it (and bumps
 * `forwardScore`, which is what makes the "Forwarded" label appear), so a
 * forward survives the original being deleted.
 */
export function ForwardDialog({
  message,
  onClose,
}: {
  message: WaMessage | null;
  onClose: () => void;
}) {
  const t = useT();
  const { mutate } = useSWRConfig();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const { data } = useSWR<{ chats: WaChatSummary[] }>(
    message ? wppKeys.chats : null,
  );

  const chats = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = data?.chats ?? [];
    // Forwarding a message back into its own chat is never what anyone means.
    const eligible = all.filter((c) => c.isMember && c.id !== message?.chatId);
    return q ? eligible.filter((c) => c.name.toLowerCase().includes(q)) : eligible;
  }, [data, query, message?.chatId]);

  function toggle(chatId: string) {
    setPicked((current) =>
      current.includes(chatId)
        ? current.filter((id) => id !== chatId)
        : [...current, chatId],
    );
  }

  async function send() {
    if (!message || picked.length === 0) return;
    setSending(true);
    try {
      await wppFetch(`${WPP_API}/messages/${message.id}/forward`, {
        method: "POST",
        json: { chatIds: picked },
      });
      void mutate(wppKeys.chats);
      for (const chatId of picked) void mutate(wppKeys.messages(chatId));
      toast.success(t("message.forwardSent"));
      close();
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setSending(false);
    }
  }

  function close() {
    setPicked([]);
    setQuery("");
    onClose();
  }

  return (
    <Dialog open={message != null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("message.forwardTitle")}</DialogTitle>
          <DialogDescription>{t("message.selectChats")}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--wa-text-dim)]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("chats.searchPlaceholder")}
            className="h-10 pl-9"
          />
        </div>

        <div className="wa-scroll max-h-72 overflow-y-auto">
          {chats.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--wa-text-dim)]">
              {query.trim() ? t("message.forwardNoMatches") : t("chats.empty")}
            </p>
          ) : (
            <ul>
              {chats.map((chat) => {
                const on = picked.includes(chat.id);
                return (
                  <li key={chat.id}>
                    <button
                      type="button"
                      onClick={() => toggle(chat.id)}
                      aria-pressed={on}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--wa-hover)]"
                    >
                      <WaAvatar
                        name={chat.name}
                        avatarUrl={chat.avatarUrl}
                        group={chat.type === "GROUP"}
                        size={40}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-[var(--wa-text)]">
                        {chat.name}
                      </span>
                      <span
                        className={
                          on
                            ? "flex size-5 items-center justify-center rounded-full bg-[var(--wa-green)] text-[var(--wa-green-ink)]"
                            : "size-5 rounded-full border border-[var(--wa-divider)]"
                        }
                      >
                        {on && <Check className="size-3.5" />}
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
            disabled={sending || picked.length === 0}
            onClick={() => void send()}
            className="bg-[var(--wa-green-deep)] text-white hover:bg-[var(--wa-green-hover)]"
          >
            {t("message.forward")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
