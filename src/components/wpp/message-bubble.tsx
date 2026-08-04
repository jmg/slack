"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import {
  Ban,
  Check,
  ChevronDown,
  Copy,
  Pin,
  PinOff,
  CornerUpLeft,
  Forward,
  Info,
  Pencil,
  ListChecks,
  Share2,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WaAttachments } from "@/components/wpp/wa-attachments";
import { WaPoll } from "@/components/wpp/wa-poll";
import { WaVoiceNote } from "@/components/wpp/wa-voice-note";
import { WaEmojiPicker } from "@/components/wpp/wa-emoji-picker";
import { WaTicks } from "@/components/wpp/wa-ticks";
import { WaText } from "@/components/wpp/wa-text";
import { MessageInfoDialog } from "@/components/wpp/message-info-dialog";
import { useMe, useT, useWppLocale } from "@/components/wpp/i18n-provider";
import { wppError, wppFetch, wppKeys } from "@/lib/wpp/client";
import { WPP_API, DELETE_FOR_EVERYONE_WINDOW_MS, EDIT_WINDOW_MS, FORWARD_MANY_THRESHOLD } from "@/lib/wpp/config";
import { formatTime } from "@/lib/wpp/format";
import { attachmentLabelKey, systemMessageText } from "@/lib/wpp/preview";
import { waAvatarColor } from "@/lib/wpp/format";
import type { WaMessage } from "@/lib/wpp/types";

/**
 * One message.
 *
 * Bubble side, ticks and the available actions all come from `message.mine` and
 * `message.tick`, which the server resolved for *this* viewer — the component
 * never recomputes them, because the inputs (read cursors, the other side's
 * privacy settings) never leave the server.
 */
export function MessageBubble({
  message,
  isGroup,
  showTail,
  showSender,
  highlighted = false,
  pending = false,
  selecting = false,
  selected = false,
  onToggleSelect,
  onReply,
  onEdit,
  onForward,
  onJumpTo,
}: {
  message: WaMessage;
  isGroup: boolean;
  /** First bubble of a run from this sender — only that one gets the tail. */
  showTail: boolean;
  showSender: boolean;
  highlighted?: boolean;
  /** Optimistic bubble whose POST hasn't returned yet. */
  pending?: boolean;
  /** Multi-select is active: the whole row becomes a checkbox. */
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect: (messageId: string) => void;
  onReply: (message: WaMessage) => void;
  onEdit: (message: WaMessage) => void;
  onForward: (message: WaMessage) => void;
  onJumpTo: (messageId: string) => void;
}) {
  const t = useT();
  const me = useMe();
  const locale = useWppLocale();
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState(false);
  /**
   * Both edit and "delete for everyone" are time-limited, so whether to offer
   * them depends on the clock — which must not be read during render, and would
   * be stale by the time the menu is used anyway. Sampling it when the menu
   * opens is both pure and more accurate.
   *
   * Declared above the SYSTEM early-return below: hooks must run in the same
   * order on every render, and a system message takes that branch.
   */
  const [menuOpenedAt, setMenuOpenedAt] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);

  // ── System messages are a centred chip, not a bubble ────────────────────
  if (message.kind === "SYSTEM" && message.system) {
    return (
      <div className="flex justify-center py-1">
        <span className="max-w-[80%] rounded-md bg-[var(--wa-system)] px-3 py-1.5 text-center text-xs text-[var(--wa-system-ink)] shadow-sm">
          {systemMessageText(message.system, me.id, t)}
        </span>
      </div>
    );
  }

  const mine = message.mine;

  const age = menuOpenedAt - new Date(message.createdAt).getTime();
  const canEdit =
    mine && !message.deleted && message.kind === "TEXT" && age < EDIT_WINDOW_MS;
  const canDeleteForEveryone =
    mine && !message.deleted && age < DELETE_FOR_EVERYONE_WINDOW_MS;

  const refresh = () => {
    void mutate(wppKeys.messages(message.chatId));
    void mutate(wppKeys.chats);
  };

  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      refresh();
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setBusy(false);
    }
  }

  const react = (emoji: string) =>
    act(() =>
      wppFetch(`${WPP_API}/messages/${message.id}/reactions`, {
        method: "POST",
        // Tapping the reaction you already left removes it, as in WhatsApp.
        json: { emoji: message.reactions.find((r) => r.mine)?.emoji === emoji ? "" : emoji },
      }),
    );

  const toggleStar = () =>
    act(async () => {
      await wppFetch(`${WPP_API}/messages/${message.id}/star`, { method: "POST" });
      void mutate(wppKeys.starred);
    });

  const togglePin = () =>
    act(async () => {
      await wppFetch(`${WPP_API}/messages/${message.id}/pin`, { method: "POST" });
      void mutate(wppKeys.chat(message.chatId));
    });

  const remove = (scope: "me" | "everyone") =>
    act(() =>
      wppFetch(`${WPP_API}/messages/${message.id}`, {
        method: "DELETE",
        json: { scope },
      }),
    );

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.body);
      toast.success(t("common.copied"));
    } catch {
      toast.error(t("common.somethingWrong"));
    }
  }

  const voiceNote =
    message.kind === "VOICE" ? message.attachments[0] : undefined;
  const otherAttachments = voiceNote
    ? message.attachments.slice(1)
    : message.attachments;

  return (
    <div
      id={`wa-msg-${message.id}`}
      // In select mode the row itself is the control: WhatsApp lets you tap
      // anywhere on a message to add it to the selection, and suppresses the
      // per-message menus entirely so a tap can't mean two things.
      onClick={selecting ? () => onToggleSelect(message.id) : undefined}
      className={cn(
        "group/msg flex px-2 py-px transition-colors",
        mine ? "justify-end" : "justify-start",
        // The reaction pill hangs below the bubble (-bottom-3) and rows are
        // only a pixel apart, so without this it lands underneath the next
        // message — which, being later in the DOM, paints over it.
        message.reactions.length > 0 && "pb-4",
        highlighted && "permalink-flash",
        selecting && "cursor-pointer",
        selected && "bg-[color-mix(in_srgb,var(--wa-green)_14%,transparent)]",
      )}
    >
      {selecting && (
        <span
          role="checkbox"
          aria-checked={selected}
          aria-label={message.body || t("common.options")}
          className={cn(
            "mt-2 mr-2 flex size-5 shrink-0 items-center justify-center self-start rounded-full border",
            selected
              ? "border-transparent bg-[var(--wa-green)] text-[var(--wa-green-ink)]"
              : "border-[var(--wa-divider)]",
          )}
        >
          {selected && <Check className="size-3.5" />}
        </span>
      )}
      <div
        className={cn(
          "relative max-w-[85%] min-w-24 rounded-lg px-2 pt-1.5 pb-1 text-sm shadow-[var(--wa-bubble-shadow)] sm:max-w-[70%]",
          // `wa-out` is not decoration: globals.css redefines the dim colour
          // tokens inside it, because they are unreadable on the green.
          mine
            ? "wa-out bg-[var(--wa-bubble-out)] text-[var(--wa-text)]"
            : "bg-[var(--wa-bubble-in)] text-[var(--wa-text)]",
          showTail && (mine ? "wa-bubble-tail-out rounded-tr-none" : "wa-bubble-tail-in rounded-tl-none"),
        )}
      >
        {/* Sender name — only in groups, and only on the first of a run. */}
        {isGroup && !mine && showSender && message.sender && (
          <p
            className="mb-0.5 text-xs font-medium"
            style={{ color: waAvatarColor(message.sender.name || message.sender.id) }}
          >
            {message.sender.name || t("common.deletedAccount")}
          </p>
        )}

        {message.forwardScore > 0 && !message.deleted && (
          <p className="mb-0.5 flex items-center gap-1 text-xs text-[var(--wa-text-dim)] italic">
            <Share2 className="size-3" />
            {t(
              message.forwardScore >= FORWARD_MANY_THRESHOLD
                ? "message.forwardedMany"
                : "message.forwarded",
            )}
          </p>
        )}

        {message.replyTo && (
          <button
            type="button"
            onClick={() => onJumpTo(message.replyTo!.id)}
            className="mb-1 flex w-full flex-col items-start gap-0.5 rounded border-l-4 bg-[var(--wa-quote)] px-2 py-1 text-left"
            style={{
              borderColor:
                message.replyTo.senderId === me.id
                  ? "var(--wa-green)"
                  : waAvatarColor(message.replyTo.senderName || "?"),
            }}
          >
            <span className="text-xs font-medium text-[var(--wa-green)]">
              {message.replyTo.senderId === me.id
                ? t("common.you")
                : message.replyTo.senderName || t("common.deletedAccount")}
            </span>
            <span className="line-clamp-2 text-xs text-[var(--wa-text-dim)]">
              {message.replyTo.deleted
                ? t("chats.messageDeleted")
                : message.replyTo.body ||
                  t(attachmentLabelKey(message.replyTo.kind) ?? "chats.attachmentDocument")}
            </span>
          </button>
        )}

        {message.deleted ? (
          <p className="flex items-center gap-1.5 py-0.5 text-[var(--wa-text-dim)] italic">
            <Ban className="size-4" />
            {t(mine ? "message.deletedByYou" : "message.deletedForEveryone")}
          </p>
        ) : (
          <>
            {voiceNote && (
              <WaVoiceNote
                attachment={voiceNote}
                mine={mine}
                senderName={message.sender?.name}
                senderAvatarUrl={message.sender?.avatarUrl}
              />
            )}
            {otherAttachments.length > 0 && (
              <WaAttachments attachments={otherAttachments} mine={mine} />
            )}
            {message.poll && (
              <WaPoll
                poll={message.poll}
                messageId={message.id}
                chatId={message.chatId}
                mine={mine}
              />
            )}
            {message.body && (
              <WaText
                body={message.body}
                mentionTokens={message.mentionTokens}
                className="block leading-snug"
              />
            )}
          </>
        )}

        {/* Timestamp row. Floated so short messages keep it on the same line,
            which is what gives WhatsApp bubbles their compact shape. */}
        <span className="float-right mt-0.5 ml-2 flex translate-y-0.5 items-center gap-1 text-[11px] leading-none text-[var(--wa-text-dim)]">
          {message.editedAt && !message.deleted && (
            <span className="italic">{t("message.edited")}</span>
          )}
          {message.starred && <Star className="size-3 fill-current" />}
          <span>{formatTime(message.createdAt, locale)}</span>
          {mine && !message.deleted && (
            <WaTicks tick={message.tick} pending={pending} />
          )}
        </span>
        <span className="clear-both block" />

        {message.reactions.length > 0 && (
          <div
            className={cn(
              "absolute -bottom-3 z-10 flex gap-0.5 rounded-full border border-[var(--wa-border)] bg-[var(--wa-panel)] px-1.5 py-0.5 shadow-sm",
              mine ? "right-2" : "left-2",
            )}
          >
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                title={reaction.users.join(", ")}
                onClick={() => void react(reaction.emoji)}
                className={cn(
                  "flex items-center gap-0.5 text-xs leading-none",
                  reaction.mine && "font-semibold",
                )}
              >
                <span>{reaction.emoji}</span>
                {reaction.count > 1 && (
                  <span className="text-[10px] text-[var(--wa-text-dim)]">
                    {reaction.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Hover affordances: quick react + the full action menu. */}
        {!pending && !selecting && !message.deleted && (
          <div
            className={cn(
              "absolute top-0 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100",
              mine ? "right-full mr-1" : "left-full ml-1",
            )}
          >
            <WaEmojiPicker onPick={(emoji) => void react(emoji)} side="top" />
          </div>
        )}

        {!pending && !selecting && (
          <DropdownMenu
            onOpenChange={(open) => open && setMenuOpenedAt(Date.now())}
          >
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={t("common.options")}
                  className={cn(
                    "absolute top-0.5 right-0.5 rounded p-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100",
                    mine
                      ? "bg-[var(--wa-bubble-out)]"
                      : "bg-[var(--wa-bubble-in)]",
                  )}
                />
              }
            >
              <ChevronDown className="size-4 text-[var(--wa-text-dim)]" />
            </DropdownMenuTrigger>

            <DropdownMenuContent align={mine ? "end" : "start"} className="w-52">
              {!message.deleted && (
                <>
                  <DropdownMenuItem onClick={() => onReply(message)}>
                    <CornerUpLeft />
                    {t("message.reply")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onForward(message)}>
                    <Forward />
                    {t("message.forward")}
                  </DropdownMenuItem>
                  {message.body && (
                    <DropdownMenuItem onClick={() => void copy()}>
                      <Copy />
                      {t("message.copy")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => void toggleStar()}>
                    {message.starred ? <StarOff /> : <Star />}
                    {t(message.starred ? "message.unstar" : "message.star")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void togglePin()}>
                    {message.pinned ? <PinOff /> : <Pin />}
                    {t(message.pinned ? "message.unpin" : "message.pin")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onToggleSelect(message.id)}>
                    <ListChecks />
                    {t("select.start")}
                  </DropdownMenuItem>
                  {canEdit && (
                    <DropdownMenuItem onClick={() => onEdit(message)}>
                      <Pencil />
                      {t("message.edit")}
                    </DropdownMenuItem>
                  )}
                  {/* Sender-only, exactly as in WhatsApp — the endpoint enforces
                      it too, so this is only about not offering a dead action. */}
                  {mine && (
                    <DropdownMenuItem onClick={() => setInfoOpen(true)}>
                      <Info />
                      {t("message.info")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                </>
              )}

              <DropdownMenuItem
                variant="destructive"
                onClick={() => void remove("me")}
              >
                <Trash2 />
                {t("message.deleteForMe")}
              </DropdownMenuItem>
              {canDeleteForEveryone && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => void remove("everyone")}
                >
                  <Trash2 />
                  {t("message.deleteForEveryone")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <MessageInfoDialog
          messageId={infoOpen ? message.id : null}
          onClose={() => setInfoOpen(false)}
        />
      </div>
    </div>
  );
}
