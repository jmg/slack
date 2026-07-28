"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import {
  Hash,
  Lock,
  Search,
  Bell,
  Send,
  SmilePlus,
  MessageSquareText,
  ImageIcon,
  FileText,
  X,
  Pin,
} from "lucide-react";

type Reaction = { emoji: string; count: number; mine?: boolean };
type Attachment = { kind: "image" | "file"; name: string; meta: string };
type Msg = {
  id: string;
  name: string;
  color: string;
  time: string;
  text: string;
  edited?: boolean;
  reactions?: Reaction[];
  replies?: { count: number; colors: string[] };
  attachment?: Attachment;
};

const ADA = { name: "Ada L.", color: "#7c3aed" };
const ALAN = { name: "Alan T.", color: "#1264a3" };
const GRACE = { name: "Grace H.", color: "#0b6e4f" };

const DRAFT_TEXT = "On it — deploying now 🚀";
const EDIT_SUFFIX = " (staging first)";
const SEARCH_TEXT = "deploy";
const PICKER_EMOJIS = ["👍", "❤️", "✅", "🎉", "🚀", "👀"];

const seed = (): Msg[] => [
  {
    id: "m1",
    ...ADA,
    time: "9:41",
    text: "Landing page is live 🎉 pushed the **new hero** this morning.",
    reactions: [
      { emoji: "🎉", count: 4 },
      { emoji: "👀", count: 2 },
    ],
    replies: { count: 2, colors: ["#0b6e4f", "#1264a3"] },
  },
  { id: "m2", ...ALAN, time: "9:44", text: "Nice — shipping the release now." },
];

/** Inline renderer: @mentions, **bold**, `code`. */
function renderText(text: string): ReactNode[] {
  return text.split(/(@\w+|\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => {
    if (p.startsWith("@"))
      return (
        <span key={i} className="rounded bg-[#1264a3]/10 px-0.5 font-medium text-[#1264a3]">
          {p}
        </span>
      );
    if (p.startsWith("**") && p.endsWith("**"))
      return (
        <strong key={i} className="font-semibold">
          {p.slice(2, -2)}
        </strong>
      );
    if (p.startsWith("`") && p.endsWith("`"))
      return (
        <code key={i} className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.85em] text-[#c7254e]">
          {p.slice(1, -1)}
        </code>
      );
    return <span key={i}>{p}</span>;
  });
}

const GRACE_MSG: Msg = {
  id: "g",
  ...GRACE,
  time: "9:45",
  text: "Beautiful work @Ada 🙌 the mobile layout looks great.",
  attachment: { kind: "image", name: "mobile-preview.png", meta: "240 KB" },
};
const ALAN_MSG: Msg = {
  id: "a3",
  ...ALAN,
  time: "9:47",
  text: "Done — logs in `deploy.log`. **v2.1** is live 🚀",
  attachment: { kind: "file", name: "deploy.log", meta: "12 KB" },
};

export function ChatDemo() {
  const [messages, setMessages] = useState<Msg[]>(seed);
  const [typing, setTyping] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [picker, setPicker] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [thread, setThread] = useState(false);
  const [fading, setFading] = useState(false);
  const [alanOnline, setAlanOnline] = useState(false);
  const [engUnread, setEngUnread] = useState(3);
  const [newLine, setNewLine] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const react = (id: string, emoji: string) =>
      setMessages((ms) =>
        ms.map((m) =>
          m.id === id
            ? { ...m, reactions: [...(m.reactions ?? []), { emoji, count: 1, mine: true }] }
            : m,
        ),
      );

    if (reduced) {
      const t = setTimeout(() => {
        setAlanOnline(true);
        setNewLine(true);
        setMessages([
          ...seed(),
          { ...GRACE_MSG, reactions: [{ emoji: "✅", count: 1, mine: true }] },
          { id: "a2", ...ADA, time: "9:46", text: DRAFT_TEXT + EDIT_SUFFIX, edited: true },
          ALAN_MSG,
        ]);
      }, 0);
      return () => clearTimeout(t);
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    const run = () => {
      timers.forEach(clearTimeout);
      timers.length = 0;
      setFading(false);
      setTyping(null);
      setDraft("");
      setPicker(null);
      setHover(null);
      setSearch("");
      setSearchOpen(false);
      setThread(false);
      setAlanOnline(false);
      setEngUnread(3);
      setNewLine(false);
      setToast(null);
      setMessages(seed());

      // 1. Search the workspace from the top bar.
      for (let i = 1; i <= SEARCH_TEXT.length; i++) {
        at(200 + i * 100, () => setSearch(SEARCH_TEXT.slice(0, i)));
      }
      at(900, () => setSearchOpen(true));
      at(1900, () => {
        setSearchOpen(false);
        setSearch("");
      });

      // 2. Grace types, replies with an @mention, shares an image.
      at(2100, () => setTyping("Grace Hopper"));
      at(3300, () => {
        setTyping(null);
        setNewLine(true);
        setMessages((m) => [...m, GRACE_MSG]);
      });
      // 3. Hover toolbar → emoji picker → reaction lands.
      at(4100, () => setHover("g"));
      at(4500, () => setPicker("g"));
      at(5200, () => {
        setPicker(null);
        setHover(null);
        react("g", "✅");
      });

      // 4. You compose char-by-char and send.
      for (let i = 1; i <= DRAFT_TEXT.length; i++) {
        at(5800 + i * 42, () => setDraft(DRAFT_TEXT.slice(0, i)));
      }
      const sentAt = 5800 + DRAFT_TEXT.length * 42 + 300;
      at(sentAt, () => {
        setDraft("");
        setMessages((m) => [...m, { id: "a2", ...ADA, time: "9:46", text: DRAFT_TEXT }]);
      });
      at(sentAt + 600, () => react("a2", "🔥"));
      // A notification arrives from another channel (badge ticks up + a toast).
      at(sentAt + 900, () => {
        setEngUnread(4);
        setToast("#engineering · Grace: build passed ✅");
      });
      at(sentAt + 3200, () => setToast(null));
      // 5. Edit that message.
      at(sentAt + 1400, () =>
        setMessages((m) =>
          m.map((x) => (x.id === "a2" ? { ...x, text: DRAFT_TEXT + EDIT_SUFFIX, edited: true } : x)),
        ),
      );

      // 6. Alan comes online, then replies with formatting + a file, then reacts.
      at(sentAt + 2000, () => setAlanOnline(true));
      at(sentAt + 2200, () => setTyping("Alan Turing"));
      at(sentAt + 3400, () => {
        setTyping(null);
        setMessages((m) => [...m, ALAN_MSG]);
      });
      at(sentAt + 4100, () => react("a3", "🎉"));

      // 7. Open the thread on the first message, hold, close.
      at(sentAt + 4900, () => setThread(true));
      at(sentAt + 7100, () => setThread(false));

      // 8. Fade out → restart (a clear loop boundary).
      at(sentAt + 7700, () => setFading(true));
      at(sentAt + 8200, run);
    };

    const start = setTimeout(run, 250);
    timers.push(start);
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
      {/* notification toast */}
      {toast && (
        <div className="talk-pop absolute bottom-4 right-4 z-40 flex items-center gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-xs text-white shadow-xl">
          <Bell className="size-3.5 text-[#c4b5fd]" />
          {toast}
        </div>
      )}
      {/* window bar + search */}
      <div className="relative flex items-center gap-1.5 border-b bg-neutral-50 px-4 py-3">
        <span className="size-3 rounded-full bg-[#ff5f57]" />
        <span className="size-3 rounded-full bg-[#febc2e]" />
        <span className="size-3 rounded-full bg-[#28c840]" />
        <div className="ml-4 hidden w-48 items-center gap-1.5 rounded-md bg-white px-2 py-1 text-xs ring-1 ring-black/5 sm:flex">
          <Search className="size-3 text-neutral-400" />
          <span className={search ? "text-neutral-800" : "text-neutral-400"}>
            {search || "Search Acme Inc"}
          </span>
        </div>
        {searchOpen && (
          <div className="talk-pop absolute left-[4.75rem] top-11 z-30 hidden w-56 rounded-lg border bg-white p-1 text-xs shadow-xl sm:block">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              Channels
            </p>
            <p className="flex items-center gap-1.5 rounded px-2 py-1 text-neutral-700">
              <Hash className="size-3" /> deploy-alerts
            </p>
            <p className="mt-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
              Messages
            </p>
            <p className="rounded px-2 py-1 text-neutral-700">
              <span className="font-semibold">Alan</span> — shipping the release now
            </p>
          </div>
        )}
      </div>

      <div className="flex h-[400px]">
        {/* sidebar */}
        <div className="hidden w-44 shrink-0 flex-col bg-[#4c1d95] p-3 text-sm text-white/80 sm:flex">
          <p className="mb-3 flex items-center gap-1.5 font-bold text-white">
            Acme Inc
            <Bell className="ml-auto size-3.5 text-white/50" />
          </p>
          <p className="mb-1 text-xs uppercase tracking-wide text-white/40">Channels</p>
          <div className="space-y-0.5">
            <p className="flex items-center gap-1.5 rounded bg-white/15 px-2 py-1 font-semibold text-white">
              <Hash className="size-3.5" /> general
            </p>
            <p className="flex items-center gap-1.5 px-2 py-1 font-medium text-white">
              <Hash className="size-3.5 opacity-60" /> engineering
              <span className="talk-pop ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white" key={engUnread}>
                {engUnread}
              </span>
            </p>
            <p className="flex items-center gap-1.5 px-2 py-1">
              <Lock className="size-3 opacity-60" /> design
            </p>
            <p className="flex items-center gap-1.5 px-2 py-1">
              <Hash className="size-3.5 opacity-60" /> launch
            </p>
          </div>
          <p className="mb-1 mt-4 text-xs uppercase tracking-wide text-white/40">
            Direct messages
          </p>
          <div className="space-y-0.5">
            <p className="flex items-center gap-2 px-2 py-1">
              <span className="size-2 rounded-full bg-green-400" /> Grace Hopper
            </p>
            <p className="flex items-center gap-2 px-2 py-1">
              <span
                className={
                  alanOnline
                    ? "talk-pop size-2 rounded-full bg-green-400"
                    : "size-2 rounded-full border border-white/40"
                }
              />{" "}
              Alan Turing
            </p>
          </div>
        </div>

        {/* channel */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Hash className="size-4 text-neutral-400" />
            <span className="text-sm font-bold text-neutral-800">general</span>
            <span className="hidden truncate text-xs text-neutral-400 sm:inline">
              | Company-wide announcements
            </span>
            <span className="ml-auto flex items-center gap-1 text-xs text-neutral-400">
              <Pin className="size-3" /> 1
            </span>
            <span className="text-xs text-neutral-400">· 3</span>
          </div>

          <div
            className={`flex flex-1 flex-col justify-end gap-3.5 overflow-hidden p-4 transition-opacity duration-300 ${
              fading ? "opacity-0" : "opacity-100"
            }`}
          >
            {messages.map((m, i) => (
              <Fragment key={m.id}>
                {i === 2 && newLine && (
                  <div className="talk-pop -mb-1 flex items-center gap-2 text-[11px] font-semibold text-red-500">
                    <span className="h-px flex-1 bg-red-200" /> New
                    <span className="h-px flex-1 bg-red-200" />
                  </div>
                )}
                <div className={`group relative flex gap-2.5 ${i < 2 ? "" : "talk-msg"}`}>
                {hover === m.id && (
                  <div className="talk-pop absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-md border bg-white px-1 py-0.5 shadow-sm">
                    <SmilePlus className="size-3.5 text-neutral-400" />
                    <MessageSquareText className="size-3.5 text-neutral-400" />
                  </div>
                )}
                {picker === m.id && (
                  <div className="talk-pop absolute -top-8 right-2 z-20 flex gap-0.5 rounded-lg border bg-white px-1.5 py-1 shadow-lg">
                    {PICKER_EMOJIS.map((e) => (
                      <span key={e} className="rounded px-1 py-0.5 text-sm">
                        {e}
                      </span>
                    ))}
                  </div>
                )}

                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
                  style={{ backgroundColor: m.color }}
                >
                  {m.name[0]}
                </span>
                <div className="min-w-0">
                  <p className="text-sm leading-none">
                    <span className="font-bold text-neutral-800">{m.name}</span>{" "}
                    <span className="text-xs text-neutral-400">{m.time}</span>
                  </p>
                  <p className="mt-1 text-sm leading-snug text-neutral-700">
                    {renderText(m.text)}
                    {m.edited && <span className="ml-1 text-[11px] text-neutral-400">(edited)</span>}
                  </p>

                  {m.attachment && (
                    <div className="talk-pop mt-1.5">
                      {m.attachment.kind === "image" ? (
                        <div className="w-40 overflow-hidden rounded-lg border">
                          <div className="flex h-20 items-center justify-center bg-linear-to-br from-[#7c3aed]/20 to-[#1264a3]/20">
                            <ImageIcon className="size-6 text-[#7c3aed]" />
                          </div>
                          <div className="truncate px-2 py-1 text-xs text-neutral-500">
                            {m.attachment.name} · {m.attachment.meta}
                          </div>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
                          <FileText className="size-4 text-[#1264a3]" />
                          <span className="text-xs text-neutral-700">
                            {m.attachment.name}{" "}
                            <span className="text-neutral-400">· {m.attachment.meta}</span>
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {m.reactions && m.reactions.length > 0 && (
                    <div className="mt-1.5 flex gap-1">
                      {m.reactions.map((r, k) => (
                        <span
                          key={r.emoji + k}
                          className={`talk-pop flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs ${
                            r.mine
                              ? "border-[#7c3aed]/30 bg-[#7c3aed]/10 text-[#7c3aed]"
                              : "border-neutral-200 bg-neutral-50 text-neutral-600"
                          }`}
                        >
                          {r.emoji} <span className="font-medium">{r.count}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {m.replies && (
                    <button className="mt-1.5 flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs font-semibold text-[#1264a3]">
                      <span className="flex -space-x-1">
                        {m.replies.colors.map((c) => (
                          <span
                            key={c}
                            className="size-4 rounded ring-2 ring-white"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </span>
                      {m.replies.count} replies
                    </button>
                  )}
                </div>
                </div>
              </Fragment>
            ))}
          </div>

          {/* typing indicator */}
          <div className="flex h-5 items-center gap-2 px-4 text-xs text-neutral-400">
            {typing && (
              <>
                <span className="flex gap-1">
                  <span className="talk-dot size-1.5 rounded-full bg-neutral-400" />
                  <span
                    className="talk-dot size-1.5 rounded-full bg-neutral-400"
                    style={{ animationDelay: "0.2s" }}
                  />
                  <span
                    className="talk-dot size-1.5 rounded-full bg-neutral-400"
                    style={{ animationDelay: "0.4s" }}
                  />
                </span>
                {typing} is typing…
              </>
            )}
          </div>

          {/* composer */}
          <div className="m-3 mt-1 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <span className={draft ? "text-neutral-800" : "text-neutral-400"}>
              {draft || "Message #general"}
              {draft && (
                <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-neutral-500 align-middle" />
              )}
            </span>
            <span
              className={`ml-auto flex size-6 items-center justify-center rounded-md ${
                draft ? "bg-[#007a5a] text-white" : "text-neutral-300"
              }`}
            >
              <Send className="size-3.5" />
            </span>
          </div>

          {/* thread panel — slides in over the channel */}
          <div
            className={`absolute inset-y-0 right-0 z-30 flex w-60 flex-col border-l bg-white shadow-2xl transition-transform duration-300 ${
              thread ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between border-b px-3 py-3">
              <span className="text-sm font-bold text-neutral-800">Thread</span>
              <X className="size-4 text-neutral-400" />
            </div>
            <div className="space-y-3 p-3 text-sm">
              <div className="flex gap-2">
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
                  style={{ backgroundColor: ADA.color }}
                >
                  A
                </span>
                <p className="text-neutral-700">
                  <span className="font-bold text-neutral-800">Ada L.</span> Landing page is live 🎉
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400">
                <span className="h-px flex-1 bg-neutral-200" /> 2 replies
                <span className="h-px flex-1 bg-neutral-200" />
              </div>
              <div className="flex gap-2">
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
                  style={{ backgroundColor: GRACE.color }}
                >
                  G
                </span>
                <p className="text-neutral-700">
                  <span className="font-bold text-neutral-800">Grace H.</span> Testing on iOS now 📱
                </p>
              </div>
              <div className="flex gap-2">
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
                  style={{ backgroundColor: ALAN.color }}
                >
                  A
                </span>
                <p className="text-neutral-700">
                  <span className="font-bold text-neutral-800">Alan T.</span> LGTM ✅ ship it
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
