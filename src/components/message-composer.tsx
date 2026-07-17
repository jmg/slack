"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import type { SidebarMember } from "@/lib/types";

const MENTION_RE = /(^|\s)@([a-zA-Z0-9._-]*)$/;

export function MessageComposer({
  placeholder,
  onSend,
  workspaceId,
  autoFocus,
}: {
  placeholder: string;
  onSend: (body: string) => Promise<void>;
  workspaceId?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: members = [] } = useSWR<SidebarMember[]>(
    workspaceId ? `/api/workspaces/${workspaceId}/members` : null,
  );

  const matches =
    mentionQuery === null
      ? []
      : members
          .filter((m) =>
            m.name.toLowerCase().includes(mentionQuery.toLowerCase()),
          )
          .slice(0, 6);

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function detectMention(text: string, caret: number) {
    if (!workspaceId) return;
    const upto = text.slice(0, caret);
    const m = MENTION_RE.exec(upto);
    if (m) {
      setMentionQuery(m[2]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }

  function applyMention(member: SidebarMember) {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? value.length;
    const upto = value.slice(0, caret);
    const m = MENTION_RE.exec(upto);
    if (!m) return;
    const handle = member.name.split(/\s+/)[0];
    const start = m.index + m[1].length; // position of the '@'
    const next = `${value.slice(0, start)}@${handle} ${value.slice(caret)}`;
    setValue(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + handle.length + 2;
      el?.setSelectionRange(pos, pos);
      resize();
    });
  }

  async function submit() {
    const body = value.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onSend(body);
      setValue("");
      requestAnimationFrame(resize);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionQuery !== null && matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyMention(matches[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="px-4 pb-4 pt-1">
      <div className="relative">
        {mentionQuery !== null && matches.length > 0 && (
          <div className="absolute bottom-full left-0 z-10 mb-1 w-64 overflow-hidden rounded-lg border bg-popover shadow-md">
            {matches.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyMention(m);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm",
                  i === mentionIndex ? "bg-accent" : "hover:bg-accent",
                )}
              >
                <UserAvatar name={m.name} image={m.image} className="size-6" />
                <span className="truncate">{m.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-lg border bg-background p-2 shadow-sm focus-within:border-foreground/30">
          <textarea
            ref={textareaRef}
            value={value}
            autoFocus={autoFocus}
            onChange={(e) => {
              setValue(e.target.value);
              resize();
              detectMention(e.target.value, e.target.selectionStart ?? 0);
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={1}
            className="max-h-52 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button
            type="button"
            size="icon"
            onClick={submit}
            disabled={!value.trim() || sending}
            className={cn(
              "size-8 shrink-0",
              value.trim() ? "bg-[#007a5a] hover:bg-[#148567]" : "",
            )}
            aria-label="Send message"
          >
            <SendHorizontal className="size-4" />
          </Button>
        </div>
      </div>
      <p className="mt-1 px-1 text-xs text-muted-foreground">
        <kbd className="font-sans font-semibold">Enter</kbd> to send,{" "}
        <kbd className="font-sans font-semibold">Shift+Enter</kbd> for a new line
        {workspaceId ? (
          <>
            , <kbd className="font-sans font-semibold">@</kbd> to mention
          </>
        ) : null}
        .
      </p>
    </div>
  );
}
