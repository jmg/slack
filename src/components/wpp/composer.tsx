"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import {
  BarChart3,
  FileText,
  ImageIcon,
  Mic,
  Paperclip,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WaEmojiPicker } from "@/components/wpp/wa-emoji-picker";
import { MentionAutocomplete } from "@/components/wpp/mention-autocomplete";
import { NewPollDialog } from "@/components/wpp/new-poll-dialog";
import { useT } from "@/components/wpp/i18n-provider";
import { wppError, wppFetch, wppKeys } from "@/lib/wpp/client";
import { WPP_API, TYPING_THROTTLE_MS } from "@/lib/wpp/config";
import {
  MAX_WPP_FILES_PER_MESSAGE,
  formatBytes,
  formatDuration,
  maxBytesFor,
  type WppSerializedAttachment,
} from "@/lib/wpp/upload-limits";
import { attachmentLabelKey } from "@/lib/wpp/preview";
import { useVoiceRecorder } from "@/lib/wpp/use-voice-recorder";
import type { WaMessage } from "@/lib/wpp/types";

/**
 * The message box.
 *
 * Three things happen here that aren't obvious from the markup:
 *
 * 1. **Uploads go first.** Files are POSTed to `/api/wpp/uploads` while you keep
 *    typing, and the send only carries their ids. That's what makes a message
 *    with a 15 MB video feel instant, and it's why the server claims the
 *    attachments inside the send transaction rather than trusting the client.
 * 2. **Drafts are saved.** Unsent text is PATCHed onto the membership row after
 *    a pause, so it survives a reload and shows up in the chat list — exactly
 *    what WhatsApp's red "Draft:" prefix is.
 * 3. **Typing is throttled.** One POST every few seconds while you type, and no
 *    "stopped typing" at all; recipients let the indicator lapse on its own.
 */
export function Composer({
  chatId,
  disabled,
  disabledReason,
  replyTo,
  editing,
  initialDraft,
  onCancelReply,
  onCancelEdit,
  onSent,
}: {
  chatId: string;
  disabled: boolean;
  disabledReason: string | null;
  replyTo: WaMessage | null;
  editing: WaMessage | null;
  initialDraft: string | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  /**
   * Show an optimistic bubble. Returns the callback that removes it again,
   * which the composer fires once the server's copy is in the cache.
   */
  onSent: (optimistic: { body: string; hasAttachments: boolean }) => () => void;
}) {
  const t = useT();
  const { mutate } = useSWRConfig();

  const [text, setText] = useState(initialDraft ?? "");
  const [attachments, setAttachments] = useState<WppSerializedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const lastTypingAt = useRef(0);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The value a debounced PATCH is waiting to write, so it can be flushed on
  // the way out or dropped when the message it belongs to is sent.
  const pendingDraft = useRef<string | null>(null);
  // Compared against the *persisted* draft so an unchanged chat never PATCHes.
  const savedDraft = useRef(initialDraft ?? "");

  const recorder = useVoiceRecorder();

  // The `@token` the caret is currently sitting in, if any, plus the row the
  // arrow keys have highlighted. Both live here rather than in the picker
  // because they are derived from the textarea's value and selection.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [pollOpen, setPollOpen] = useState(false);

  /**
   * Entering and leaving edit mode swaps what's in the box.
   *
   * Adjusted during render rather than in an effect — the React-sanctioned
   * "derive state from props" pattern — because the alternatives are both
   * wrong: an effect renders one frame with the previous text, and remounting
   * on a `key` throws away an unsent draft that the server hasn't been told
   * about yet (the debounce may not have fired).
   */
  const editingId = editing?.id ?? null;
  const [seededFrom, setSeededFrom] = useState<string | null>(null);
  const [stashedDraft, setStashedDraft] = useState("");

  if (editingId !== seededFrom) {
    setSeededFrom(editingId);
    if (editing) {
      setStashedDraft(text);
      setText(editing.body);
    } else {
      setText(stashedDraft);
      setStashedDraft("");
    }
  }

  // Switching chat remounts this component (the pane is keyed by chat id), so
  // `useState(initialDraft)` above already runs fresh — no reset effect needed.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  /** Write the queued draft now, if there is one and it differs from the server's. */
  const flushDraft = useCallback(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;

    const value = pendingDraft.current;
    pendingDraft.current = null;
    if (value === null || value === savedDraft.current) return;

    savedDraft.current = value;
    void wppFetch(`${wppKeys.chat(chatId)}/state`, {
      method: "PATCH",
      json: { draft: value },
      // Survives the tab being closed on the way out.
      keepalive: true,
    })
      .then(() => mutate(wppKeys.chats))
      .catch(() => {});
  }, [chatId, mutate]);

  /** Forget the queued draft — the text it held is being sent, not saved. */
  const cancelDraft = useCallback(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
    pendingDraft.current = null;
  }, []);

  const persistDraft = useCallback(
    (value: string) => {
      pendingDraft.current = value;
      if (draftTimer.current) clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(flushDraft, 700);
    },
    [flushDraft],
  );

  // Switching chats unmounts this component (the pane is keyed by chat id), and
  // that happens well inside the 700 ms debounce. *Flush*, don't cancel:
  // dropping the timer here is how a draft typed and abandoned in under a second
  // used to vanish with no trace in the chat list.
  useEffect(() => flushDraft, [flushDraft]);

  /**
   * The partial `@token` immediately before the caret, or null.
   *
   * Anchored to the caret rather than scanning the whole body: typing "@ad" at
   * the end of a message that already contains "@grace" must offer Ada, not
   * Grace. Requires whitespace (or the start) before the "@" so an email
   * address never opens the picker.
   */
  function mentionQueryAt(value: string, caret: number): string | null {
    const before = value.slice(0, caret);
    const match = /(?:^|\s)@([\p{L}\p{N}_-]{0,40})$/u.exec(before);
    return match ? match[1].toLowerCase() : null;
  }

  function onType(value: string, caret?: number) {
    setText(value);
    if (!editing) persistDraft(value);

    const at = caret ?? value.length;
    const query = mentionQueryAt(value, at);
    setMentionQuery(query);
    if (query === null) setMentionIndex(0);

    const now = Date.now();
    if (value && now - lastTypingAt.current > TYPING_THROTTLE_MS) {
      lastTypingAt.current = now;
      void fetch(`${WPP_API}/chats/${chatId}/typing`, { method: "POST" }).catch(
        () => {},
      );
    }
  }

  /** Replace the partial token under the caret with the chosen one. */
  function insertMention(token: string) {
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@[\p{L}\p{N}_-]{0,40}$/u, "");
    const next = `${before}@${token} ${text.slice(caret)}`;

    setText(next);
    setMentionQuery(null);
    setMentionIndex(0);
    if (!editing) persistDraft(next);

    // Put the caret after the inserted token, not at the end — you might be
    // mentioning somebody mid-sentence.
    const position = before.length + token.length + 2;
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(position, position);
    });
  }

  /** Measure an image before upload so the bubble can reserve its space. */
  async function imageSize(file: File): Promise<{ width?: number; height?: number }> {
    if (!file.type.startsWith("image/")) return {};
    try {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    } catch {
      return {};
    }
  }

  async function upload(files: File[]) {
    const room = MAX_WPP_FILES_PER_MESSAGE - attachments.length;
    if (files.length > room) {
      toast.error(t("composer.tooManyFiles", { count: MAX_WPP_FILES_PER_MESSAGE }));
      files = files.slice(0, Math.max(0, room));
    }
    if (files.length === 0) return;

    setUploading(true);
    try {
      for (const file of files) {
        const limit = maxBytesFor(file.type);
        if (file.size > limit) {
          toast.error(
            t("composer.fileTooBig", {
              name: file.name,
              limit: formatBytes(limit),
            }),
          );
          continue;
        }

        const form = new FormData();
        form.append("file", file);
        form.append("purpose", "MESSAGE");
        form.append("chatId", chatId);
        const { width, height } = await imageSize(file);
        if (width) form.append("width", String(width));
        if (height) form.append("height", String(height));

        const uploaded = await wppFetch<WppSerializedAttachment>(
          `${WPP_API}/uploads`,
          { method: "POST", body: form },
        );
        setAttachments((current) => [...current, uploaded]);
      }
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setUploading(false);
    }
  }

  async function sendVoiceNote() {
    const recording = await recorder.stop();
    if (!recording) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", recording.blob, "voice-note.webm");
      form.append("purpose", "MESSAGE");
      form.append("chatId", chatId);
      form.append("voice", "1");
      form.append("durationMs", String(recording.durationMs));
      form.append("waveform", recording.waveform);

      const uploaded = await wppFetch<WppSerializedAttachment>(
        `${WPP_API}/uploads`,
        { method: "POST", body: form },
      );
      await submit([uploaded]);
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      setUploading(false);
    }
  }

  async function submit(extra: WppSerializedAttachment[] = []) {
    const all = [...attachments, ...extra];
    const body = text.trim();
    if (sending) return;
    if (!body && all.length === 0) return;

    // Removes the optimistic bubble once the server's copy has landed.
    let settle: (() => void) | undefined;

    // The queued draft holds exactly the text being sent. Left armed, it fires
    // ~600 ms later and writes the message back onto the membership row the
    // send just cleared — the chat then shows a permanent "Draft:" of a message
    // you already sent, and reopening it pre-fills the box with it.
    cancelDraft();

    setSending(true);
    try {
      if (editing) {
        await wppFetch(`${WPP_API}/messages/${editing.id}`, {
          method: "PATCH",
          json: { body },
        });
        onCancelEdit();
      } else {
        settle = onSent({ body, hasAttachments: all.length > 0 });
        await wppFetch(`${WPP_API}/chats/${chatId}/messages`, {
          method: "POST",
          json: {
            body,
            replyToId: replyTo?.id,
            attachmentIds: all.map((a) => a.id),
          },
        });
        onCancelReply();
      }

      setText("");
      setAttachments([]);
      savedDraft.current = "";
      // Await the revalidation before telling the parent to drop the optimistic
      // bubble, so the placeholder is replaced rather than blinking out and
      // back in.
      await mutate(wppKeys.messages(chatId));
      void mutate(wppKeys.chats);
    } catch (err) {
      toast.error(wppError(err, t));
    } finally {
      settle?.();
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // While the mention picker is open it owns Enter and the arrows — otherwise
    // choosing a name would send the half-typed message instead.
    if (mentionQuery !== null) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => i + 1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        // The picker turns this into a selection via its own handler; swallow
        // the key so the message isn't sent underneath it.
        e.preventDefault();
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
    if (e.key === "Escape") {
      if (editing) onCancelEdit();
      else if (replyTo) onCancelReply();
    }
  }

  if (disabled) {
    return (
      <div className="shrink-0 border-t border-[var(--wa-border)] bg-[var(--wa-header)] px-4 py-4 text-center text-sm text-[var(--wa-text-dim)]">
        {disabledReason ?? t("composer.placeholderReadOnly")}
      </div>
    );
  }

  const hasContent = text.trim().length > 0 || attachments.length > 0;

  return (
    <div className="shrink-0 border-t border-[var(--wa-border)] bg-[var(--wa-header)]">
      {(replyTo || editing) && (
        <div className="flex items-start gap-2 px-4 pt-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded border-l-4 border-[var(--wa-green)] bg-[var(--wa-quote)] px-3 py-1.5">
            <span className="text-xs font-medium text-[var(--wa-green)]">
              {editing
                ? t("composer.editing")
                : t("composer.replyingTo", {
                    name: replyTo?.sender?.name ?? t("common.you"),
                  })}
            </span>
            <span className="truncate text-xs text-[var(--wa-text-dim)]">
              {(editing ?? replyTo)?.body ||
                t(
                  attachmentLabelKey((editing ?? replyTo)!.kind) ??
                    "chats.attachmentDocument",
                )}
            </span>
          </div>
          <button
            type="button"
            onClick={editing ? onCancelEdit : onCancelReply}
            aria-label={t("common.cancel")}
            className="mt-1 rounded-full p-1 text-[var(--wa-text-dim)] hover:text-[var(--wa-text)]"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2 px-4 pt-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="relative flex items-center gap-2 rounded-lg bg-[var(--wa-panel)] px-2 py-1.5 text-xs"
            >
              {attachment.kind === "IMAGE" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={attachment.url}
                  alt=""
                  className="size-10 rounded object-cover"
                />
              ) : (
                <FileText className="size-5 text-[var(--wa-text-dim)]" />
              )}
              <span className="max-w-32 truncate">{attachment.filename}</span>
              <button
                type="button"
                onClick={() =>
                  setAttachments((current) =>
                    current.filter((a) => a.id !== attachment.id),
                  )
                }
                aria-label={t("common.remove")}
                className="rounded-full p-0.5 text-[var(--wa-text-dim)] hover:text-[var(--wa-text)]"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative flex items-end gap-1 px-3 py-2">
        <MentionAutocomplete
          chatId={chatId}
          query={mentionQuery}
          activeIndex={mentionIndex}
          onPick={insertMention}
        />
        {recorder.recording ? (
          <div className="flex flex-1 items-center gap-3 px-2">
            <button
              type="button"
              onClick={() => recorder.cancel()}
              aria-label={t("composer.cancelRecording")}
              className="rounded-full p-2 text-[var(--destructive)] hover:bg-[var(--wa-hover)]"
            >
              <Trash2 className="size-5" />
            </button>
            <span className="wa-pulse size-2.5 rounded-full bg-[var(--destructive)]" />
            <span className="text-sm tabular-nums text-[var(--wa-text)]">
              {formatDuration(recorder.elapsedMs)}
            </span>
            <span className="text-sm text-[var(--wa-text-dim)]">
              {t("composer.recording")}
            </span>
          </div>
        ) : (
          <>
            <WaEmojiPicker
              onPick={(emoji) => onType(text + emoji)}
              side="top"
              align="start"
            />

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-label={t("composer.attach")}
                    disabled={uploading}
                    className="flex size-9 items-center justify-center rounded-full text-[var(--wa-text-dim)] transition-colors hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)] disabled:opacity-50"
                  />
                }
              >
                <Paperclip className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start">
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  <ImageIcon />
                  {t("composer.attachPhoto")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => docInputRef.current?.click()}>
                  <FileText />
                  {t("composer.attachDocument")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPollOpen(true)}>
                  <BarChart3 />
                  {t("poll.create")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => onType(e.target.value, e.target.selectionStart)}
              onKeyDown={onKeyDown}
              onBlur={() => setMentionQuery(null)}
              rows={1}
              placeholder={t("composer.placeholder")}
              aria-label={t("composer.placeholder")}
              className="wa-scroll max-h-32 min-h-9 flex-1 resize-none rounded-lg bg-[var(--wa-input)] px-3 py-2 text-sm text-[var(--wa-text)] outline-none placeholder:text-[var(--wa-text-dim)] field-sizing-content"
            />
          </>
        )}

        {recorder.recording ? (
          <button
            type="button"
            onClick={() => void sendVoiceNote()}
            disabled={uploading}
            aria-label={t("composer.send")}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--wa-green-deep)] text-white transition-colors hover:bg-[var(--wa-green-hover)] disabled:opacity-60"
          >
            <Send className="size-5" />
          </button>
        ) : hasContent || editing ? (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={sending || uploading}
            aria-label={t("composer.send")}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--wa-green-deep)] text-white transition-colors hover:bg-[var(--wa-green-hover)] disabled:opacity-60"
          >
            <Send className="size-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void recorder.start(t)}
            aria-label={t("composer.recordVoice")}
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--wa-text-dim)] transition-colors hover:bg-[var(--wa-hover)] hover:text-[var(--wa-text)]",
            )}
          >
            <Mic className="size-5" />
          </button>
        )}
      </div>

      {/* Two inputs rather than one: the accept filter is the whole point of the
          "Photos & videos" vs "Document" split in WhatsApp's attach menu. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          void upload(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <NewPollDialog chatId={chatId} open={pollOpen} onOpenChange={setPollOpen} />

      <input
        ref={docInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void upload(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}
