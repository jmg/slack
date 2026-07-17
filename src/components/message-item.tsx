"use client";

import { SmilePlus } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatMessageTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SerializedMessage } from "@/lib/messages";

const EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "🙌", "✅", "🔥"];

export function MessageItem({
  message,
  showHeader,
  onToggleReaction,
}: {
  message: SerializedMessage;
  showHeader: boolean;
  onToggleReaction: (messageId: string, emoji: string) => void;
}) {
  const time = formatMessageTime(message.createdAt);

  return (
    <div
      className={cn(
        "group relative flex gap-2 px-4 hover:bg-muted/40",
        showHeader ? "mt-2 pt-1.5" : "py-0.5",
      )}
    >
      <div className="w-9 shrink-0">
        {showHeader ? (
          <UserAvatar name={message.author.name} image={message.author.image} />
        ) : (
          <span className="mt-0.5 hidden pr-1 text-right text-[10px] leading-5 text-muted-foreground group-hover:block">
            {time}
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
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
          {message.body}
        </div>

        {message.reactions.length > 0 && (
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
      </div>

      <div className="absolute -top-3 right-3 hidden rounded-md border bg-background shadow-sm group-hover:flex">
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
      </div>
    </div>
  );
}
