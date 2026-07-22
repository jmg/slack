"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  SmilePlus,
  MessageSquareText,
  MoreVertical,
  Link2,
  Pencil,
  Trash2,
} from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { MessageBody } from "@/components/message-body";
import { AttachmentList } from "@/components/attachment-list";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { formatCompactTime, formatMessageTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SerializedMessage } from "@/lib/messages";

const EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "🙌", "✅", "🔥"];

export function MessageItem({
  message,
  showHeader,
  currentUserId,
  onToggleReaction,
  onEdit,
  onDelete,
  onOpenThread,
  hideThreadIndicator,
}: {
  message: SerializedMessage;
  showHeader: boolean;
  currentUserId: string;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, body: string) => Promise<void>;
  onDelete?: (messageId: string) => void;
  onOpenThread?: (message: SerializedMessage) => void;
  hideThreadIndicator?: boolean;
}) {
  const time = formatMessageTime(message.createdAt);
  const isMine = message.author.id === currentUserId;
  const deleted = message.deleted;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [saving, setSaving] = useState(false);

  async function saveEdit() {
    const body = draft.trim();
    if (!body || !onEdit) return;
    setSaving(true);
    try {
      await onEdit(message.id, body);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}?msg=${message.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  }

  return (
    <div
      id={`msg-${message.id}`}
      className={cn(
        "group relative flex scroll-mt-16 gap-2 px-4 transition-colors hover:bg-muted/40",
        showHeader ? "mt-2 pt-1.5" : "py-0.5",
      )}
    >
      <div className="w-9 shrink-0">
        {showHeader ? (
          <UserAvatar name={message.author.name} image={message.author.image} />
        ) : (
          <span className="mt-0.5 hidden whitespace-nowrap pr-1 text-right text-[10px] leading-5 tabular-nums text-muted-foreground group-hover:block">
            {formatCompactTime(message.createdAt)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {showHeader && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-foreground">
              {message.author.name}
            </span>
            <span className="text-xs text-muted-foreground">{time}</span>
          </div>
        )}

        {editing ? (
          <div className="my-1 flex flex-col gap-2">
            <textarea
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void saveEdit();
                } else if (e.key === "Escape") {
                  setEditing(false);
                  setDraft(message.body);
                }
              }}
              className="min-h-16 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/30"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit} disabled={saving || !draft.trim()}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setDraft(message.body);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : deleted ? (
          <p className="py-0.5 text-sm italic text-muted-foreground">
            This message was deleted
          </p>
        ) : (
          <>
            {message.body && (
              <div className="flex items-baseline gap-1">
                <MessageBody body={message.body} />
                {message.editedAt && (
                  <span className="text-[11px] text-muted-foreground">(edited)</span>
                )}
              </div>
            )}
            <AttachmentList attachments={message.attachments} />
          </>
        )}

        {message.reactions.length > 0 && !editing && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((r) => (
              <Tooltip key={r.emoji}>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={() => onToggleReaction(message.id, r.emoji)}
                      className={cn(
                        "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition",
                        r.reactedByMe
                          ? "border-[#1164a3]/40 bg-[#1164a3]/10 text-[#1164a3]"
                          : "border-border bg-muted/60 hover:border-foreground/20",
                      )}
                    >
                      <span>{r.emoji}</span>
                      <span className="font-medium">{r.count}</span>
                    </button>
                  }
                />
                <TooltipContent>{r.users.join(", ")}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}

        {!hideThreadIndicator && message.replyCount > 0 && !editing && (
          <button
            type="button"
            onClick={() => onOpenThread?.(message)}
            className="mt-1 flex items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-xs font-semibold text-[#1264a3] transition hover:border-border hover:bg-background"
          >
            <span className="flex -space-x-1">
              {message.replyUsers.map((u) => (
                <UserAvatar
                  key={u.id}
                  name={u.name}
                  image={u.image}
                  className="size-5 rounded ring-2 ring-background"
                />
              ))}
            </span>
            {message.replyCount} {message.replyCount === 1 ? "reply" : "replies"}
          </button>
        )}
      </div>

      {!editing && !deleted && (
        <div className="absolute -top-3 right-3 hidden items-center rounded-md border bg-background shadow-sm group-hover:flex">
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Add reaction"
            >
              <SmilePlus className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="flex gap-1 p-1">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onToggleReaction(message.id, emoji)}
                  className="flex size-8 items-center justify-center rounded text-lg transition hover:bg-muted"
                >
                  {emoji}
                </button>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {onOpenThread && (
            <button
              type="button"
              onClick={() => onOpenThread(message)}
              aria-label="Reply in thread"
              title="Reply in thread"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <MessageSquareText className="size-4" />
            </button>
          )}

          {!hideThreadIndicator && (
            <button
              type="button"
              onClick={copyLink}
              aria-label="Copy link to message"
              title="Copy link"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Link2 className="size-4" />
            </button>
          )}

          {isMine && (onEdit || onDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="More actions"
              >
                <MoreVertical className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onEdit && (
                  <DropdownMenuItem
                    onClick={() => {
                      setDraft(message.body);
                      setEditing(true);
                    }}
                  >
                    <Pencil className="size-4" /> Edit message
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(message.id)}
                  >
                    <Trash2 className="size-4" /> Delete message
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
}
