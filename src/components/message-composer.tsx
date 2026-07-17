"use client";

import { useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MessageComposer({
  placeholder,
  onSend,
}: {
  placeholder: string;
  onSend: (body: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="px-4 pb-4 pt-1">
      <div className="flex items-end gap-2 rounded-lg border bg-background p-2 shadow-sm focus-within:border-foreground/30">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            resize();
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
          className={cn("size-8 shrink-0", value.trim() ? "bg-[#007a5a] hover:bg-[#148567]" : "")}
          aria-label="Send message"
        >
          <SendHorizontal className="size-4" />
        </Button>
      </div>
      <p className="mt-1 px-1 text-xs text-muted-foreground">
        <kbd className="font-sans font-semibold">Enter</kbd> to send,{" "}
        <kbd className="font-sans font-semibold">Shift+Enter</kbd> for a new line.
      </p>
    </div>
  );
}
