"use client";

import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  ChevronDown,
  Check,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useT } from "@/components/wpp/i18n-provider";
import { wppError, wppFetch, wppKeys } from "@/lib/wpp/client";
import { MUTE_FOREVER_MS, wpp } from "@/lib/wpp/config";
import type { WaChatSummary } from "@/lib/wpp/types";

/**
 * Per-chat actions: pin, mute, archive, mark unread, delete.
 *
 * Every one of these is *per-user* state on the membership row (see
 * `/api/wpp/chats/[chatId]/state`), which is why nothing here needs to worry
 * about permissions — you can always pin your own view of a chat.
 */
export function ChatRowMenu({
  chat,
  listKey,
}: {
  chat: WaChatSummary;
  listKey: string;
}) {
  const t = useT();
  const router = useRouter();
  const { mutate } = useSWRConfig();

  async function patch(json: Record<string, unknown>) {
    try {
      await wppFetch(`${wppKeys.chat(chat.id)}/state`, { method: "PATCH", json });
      void mutate(listKey);
      void mutate(wppKeys.chats);
      void mutate(wppKeys.archived);
    } catch (err) {
      toast.error(wppError(err, t));
    }
  }

  async function remove() {
    if (!window.confirm(t("chatMenu.deleteConfirm"))) return;
    try {
      await wppFetch(wppKeys.chat(chat.id), { method: "DELETE" });
      void mutate(wppKeys.chats);
      void mutate(wppKeys.archived);
      router.push(wpp("/chats"));
    } catch (err) {
      toast.error(wppError(err, t));
    }
  }

  const muteFor = (ms: number) =>
    patch({ mutedUntil: new Date(Date.now() + ms).toISOString() });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={t("common.options")}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-[var(--wa-text-dim)] opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
          />
        }
      >
        <ChevronDown className="size-4" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => void patch({ pinned: !chat.pinned })}>
          {chat.pinned ? <PinOff /> : <Pin />}
          {t(chat.pinned ? "chatMenu.unpin" : "chatMenu.pin")}
        </DropdownMenuItem>

        {chat.mutedUntil ? (
          <DropdownMenuItem onClick={() => void patch({ mutedUntil: null })}>
            <Bell />
            {t("chatMenu.unmute")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <BellOff />
              {t("chatMenu.mute")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => void muteFor(8 * 60 * 60 * 1000)}>
                {t("chatMenu.muteFor8Hours")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void muteFor(7 * 24 * 60 * 60 * 1000)}>
                {t("chatMenu.muteFor1Week")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void muteFor(MUTE_FOREVER_MS)}>
                {t("chatMenu.muteAlways")}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuItem
          onClick={() => void patch({ unread: chat.unreadCount === 0 })}
        >
          <Check />
          {t(chat.unreadCount === 0 ? "chatMenu.markUnread" : "chatMenu.markRead")}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => void patch({ archived: !chat.archived })}>
          {chat.archived ? <ArchiveRestore /> : <Archive />}
          {t(chat.archived ? "chatMenu.unarchive" : "chatMenu.archive")}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" onClick={() => void remove()}>
          <Trash2 />
          {t("chatMenu.deleteChat")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
