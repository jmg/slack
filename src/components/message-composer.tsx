"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { Paperclip, SendHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { mentionHandle } from "@/lib/mentions";
import {
  MAX_FILES_PER_MESSAGE,
  MAX_FILE_BYTES,
  formatBytes,
  isInlineImage,
  type SerializedAttachment,
} from "@/lib/upload-limits";
import type { SidebarMember } from "@/lib/types";

const MENTION_RE = /(^|\s)@([a-zA-Z0-9._-]*)$/;

/** Intrinsic size of an image, so the message can reserve space for it. */
async function measure(file: File): Promise<{ width?: number; height?: number }> {
  if (!isInlineImage(file.type)) return {};
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return {};
  }
}

export function MessageComposer({
  placeholder,
  onSend,
  workspaceId,
  autoFocus,
}: {
  placeholder: string;
  onSend: (body: string, attachmentIds: string[]) => Promise<void>;
  workspaceId?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [pending, setPending] = useState<SerializedAttachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: members = [] } = useSWR<SidebarMember[]>(
    workspaceId ? `/api/workspaces/${workspaceId}/members` : null,
  );

  const matches =
    mentionQuery === null
      ? []
      : members
          .filter((m) => m.name.toLowerCase().includes(mentionQuery.toLowerCase()))
          .slice(0, 6);

  const canSend =
    (value.trim().length > 0 || pending.length > 0) && !sending && uploading === 0;

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  function detectMention(text: string, caret: number) {
    if (!workspaceId) return;
    const m = MENTION_RE.exec(text.slice(0, caret));
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
    const m = MENTION_RE.exec(value.slice(0, caret));
    if (!m) return;
    const token = mentionHandle(member.name);
    const start = m.index + m[1].length;
    const next = `${value.slice(0, start)}${token} ${value.slice(caret)}`;
    setValue(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + token.length + 1;
      el?.setSelectionRange(pos, pos);
      resize();
    });
  }

  async function uploadFiles(files: File[]) {
    if (!workspaceId) return;
    const room = MAX_FILES_PER_MESSAGE - pending.length;
    if (room <= 0) {
      toast.error(`Up to ${MAX_FILES_PER_MESSAGE} files per message`);
      return;
    }
    for (const file of files.slice(0, room)) {
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} is over ${formatBytes(MAX_FILE_BYTES)}`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const dims = await measure(file);
        const form = new FormData();
        form.append("file", file);
        if (dims.width) form.append("width", String(dims.width));
        if (dims.height) form.append("height", String(dims.height));
        const res = await fetch(`/api/workspaces/${workspaceId}/uploads`, {
          method: "POST",
          body: form,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        setPending((cur) => [...cur, data as SerializedAttachment]);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function submit() {
    if (!canSend) return;
    setSending(true);
    try {
      await onSend(
        value.trim(),
        pending.map((a) => a.id),
      );
      setValue("");
      setPending([]);
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

        <div
          className="rounded-lg border bg-background shadow-sm focus-within:border-foreground/30"
          onDragOver={(e) => {
            if (workspaceId) e.preventDefault();
          }}
          onDrop={(e) => {
            if (!workspaceId) return;
            e.preventDefault();
            void uploadFiles(Array.from(e.dataTransfer.files));
          }}
        >
          {(pending.length > 0 || uploading > 0) && (
            <div className="flex flex-wrap gap-2 border-b p-2">
              {pending.map((a) => (
                <span
                  key={a.id}
                  className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-xs"
                >
                  <span className="max-w-[12rem] truncate font-medium">
                    {a.filename}
                  </span>
                  <span className="text-muted-foreground">
                    {formatBytes(a.size)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${a.filename}`}
                    onClick={() =>
                      setPending((cur) => cur.filter((p) => p.id !== a.id))
                    }
                    className="text-muted-foreground transition hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              {uploading > 0 && (
                <span className="px-2 py-1 text-xs text-muted-foreground">
                  Uploading {uploading} file{uploading === 1 ? "" : "s"}…
                </span>
              )}
            </div>
          )}

          <div className="flex items-end gap-2 p-2">
            {workspaceId && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void uploadFiles(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  aria-label="Attach files"
                  title="Attach files"
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip className="size-4" />
                </Button>
              </>
            )}
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
              disabled={!canSend}
              className={cn(
                "size-8 shrink-0",
                canSend ? "bg-[#007a5a] hover:bg-[#148567]" : "",
              )}
              aria-label="Send message"
            >
              <SendHorizontal className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <p className="mt-1 px-1 text-xs text-muted-foreground">
        <kbd className="font-sans font-semibold">Enter</kbd> to send,{" "}
        <kbd className="font-sans font-semibold">Shift+Enter</kbd> for a new line
        {workspaceId ? (
          <>
            , <kbd className="font-sans font-semibold">@</kbd> to mention, drag
            files to attach
          </>
        ) : null}
        .
      </p>
    </div>
  );
}
