"use client";

import { useEffect, useState } from "react";
import { Hash, Lock, Search, Bell, Send } from "lucide-react";

type Reaction = { emoji: string; count: number; mine?: boolean };
type Msg = {
  id: string;
  name: string;
  color: string;
  time: string;
  text: string;
  reactions?: Reaction[];
  replies?: { count: number; colors: string[] };
};

const ADA = { name: "Ada L.", color: "#7c3aed" };
const ALAN = { name: "Alan T.", color: "#1264a3" };
const GRACE = { name: "Grace H.", color: "#0b6e4f" };

// The baseline conversation the loop resets to (already "in the channel").
const seed = (): Msg[] => [
  {
    id: "m1",
    ...ADA,
    time: "9:41",
    text: "Landing page is live 🎉 pushed the new hero this morning.",
    reactions: [
      { emoji: "🎉", count: 4 },
      { emoji: "👀", count: 2 },
    ],
    replies: { count: 2, colors: ["#0b6e4f", "#1264a3"] },
  },
  { id: "m2", ...ALAN, time: "9:44", text: "Nice — shipping the release now." },
];

const DRAFT_TEXT = "On it — deploying now 🚀";

export function ChatDemo() {
  const [messages, setMessages] = useState<Msg[]>(seed);
  const [typing, setTyping] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

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
      // Static: show the whole conversation, no motion. Deferred to a callback
      // so it isn't a synchronous setState inside the effect body.
      const t = setTimeout(
        () =>
          setMessages([
            ...seed(),
            { id: "g", ...GRACE, time: "9:45", text: "Beautiful work @Ada 🙌 the mobile layout looks great." },
            { id: "a2", ...ADA, time: "9:46", text: DRAFT_TEXT },
          ]),
        0,
      );
      return () => clearTimeout(t);
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    const run = () => {
      timers.forEach(clearTimeout);
      timers.length = 0;
      setTyping(null);
      setDraft("");
      setMessages(seed());

      // Grace types, then replies with an @mention.
      at(900, () => setTyping("Grace Hopper"));
      at(2200, () => {
        setTyping(null);
        setMessages((m) => [
          ...m,
          { id: "g", ...GRACE, time: "9:45", text: "Beautiful work @Ada 🙌 the mobile layout looks great." },
        ]);
      });
      at(3000, () => react("g", "✅"));

      // You compose a message in the box, character by character, then send it.
      for (let i = 1; i <= DRAFT_TEXT.length; i++) {
        at(3800 + i * 45, () => setDraft(DRAFT_TEXT.slice(0, i)));
      }
      const sentAt = 3800 + DRAFT_TEXT.length * 45 + 350;
      at(sentAt, () => {
        setDraft("");
        setMessages((m) => [...m, { id: "a2", ...ADA, time: "9:46", text: DRAFT_TEXT }]);
      });
      at(sentAt + 700, () => react("a2", "🔥"));

      // Alan chimes in, then the whole thing loops.
      at(sentAt + 1600, () => setTyping("Alan Turing"));
      at(sentAt + 2800, () => {
        setTyping(null);
        setMessages((m) => [...m, { id: "a3", ...ALAN, time: "9:47", text: "🚀 shipped to production" }]);
      });
      at(sentAt + 4800, run);
    };

    run();
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl">
      {/* window bar */}
      <div className="flex items-center gap-1.5 border-b bg-neutral-50 px-4 py-3">
        <span className="size-3 rounded-full bg-[#ff5f57]" />
        <span className="size-3 rounded-full bg-[#febc2e]" />
        <span className="size-3 rounded-full bg-[#28c840]" />
        <div className="ml-4 hidden items-center gap-1.5 rounded-md bg-white px-2 py-1 text-xs text-neutral-400 ring-1 ring-black/5 sm:flex">
          <Search className="size-3" /> Search Acme Inc
        </div>
      </div>

      <div className="flex h-[380px]">
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
            <p className="flex items-center gap-1.5 px-2 py-1">
              <Hash className="size-3.5 opacity-60" /> engineering
              <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                3
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
              <span className="size-2 rounded-full border border-white/40" /> Alan Turing
            </p>
          </div>
        </div>

        {/* channel */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Hash className="size-4 text-neutral-400" />
            <span className="text-sm font-bold text-neutral-800">general</span>
            <span className="ml-auto text-xs text-neutral-400">3 members</span>
          </div>

          {/* messages — bottom-anchored so the newest is always visible */}
          <div className="flex flex-1 flex-col justify-end gap-3.5 overflow-hidden p-4">
            {messages.map((m, i) => (
              <div
                key={m.id}
                className={i < 2 ? "flex gap-2.5" : "talk-msg flex gap-2.5"}
              >
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
                    {m.text.split(/(@\w+)/).map((part, j) =>
                      part.startsWith("@") ? (
                        <span
                          key={j}
                          className="rounded bg-[#1264a3]/10 px-0.5 font-medium text-[#1264a3]"
                        >
                          {part}
                        </span>
                      ) : (
                        <span key={j}>{part}</span>
                      ),
                    )}
                  </p>

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
        </div>
      </div>
    </div>
  );
}
