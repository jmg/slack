"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { WPP_API, PRESENCE_HEARTBEAT_MS, TYPING_TTL_MS, wpp } from "@/lib/wpp/config";
import { wppKeys } from "@/lib/wpp/client";
import { notifyIncoming, playIncomingTone } from "@/lib/wpp/notifications";
import type { WppEvent } from "@/lib/wpp/realtime-types";
import type { WaChatSummary } from "@/lib/wpp/types";

/**
 * The app's single live connection.
 *
 * One `EventSource` for the whole account (not one per chat): a WhatsApp account
 * has no workspace to scope a stream to, and you need to hear about a message in
 * a chat you *don't* have open — that's what makes the badge appear. The server
 * resolves the audience per event (see `lib/wpp/realtime.ts`).
 *
 * Every frame is a *signal*, not a payload, so handling one is always "revalidate
 * exactly this SWR key". `EventSource` reconnects by itself; on every (re)connect
 * we revalidate everything to catch what was missed while the stream was down.
 *
 * Typing is the exception — it carries its data inline and never touches SWR,
 * because there is no endpoint behind it and nothing worth caching.
 */

type TypingEntry = { name: string; at: number };
type TypingState = Record<string, Record<string, TypingEntry>>; // chatId → userId → …

type RealtimeValue = {
  typing: TypingState;
  /** True while the stream is connected — drives the "connecting…" banner. */
  connected: boolean;
};

const RealtimeContext = createContext<RealtimeValue>({
  typing: {},
  connected: true,
});

export function WppRealtimeProvider({ children }: { children: React.ReactNode }) {
  const { mutate, cache } = useSWRConfig();
  const router = useRouter();
  const pathname = usePathname();
  const [typing, setTyping] = useState<TypingState>({});
  const [connected, setConnected] = useState(true);
  // Kept in a ref so the pruning interval below doesn't need to be re-created
  // (and the stream re-opened) every time somebody types.
  const typingRef = useRef<TypingState>({});

  /**
   * Alerting on an incoming message.
   *
   * Held in a ref and read by the (stable) stream effect, so changing route or
   * chat list never tears the SSE connection down and reconnects it.
   *
   * The event is only a signal, so the *content* comes from the chat list that
   * the same event just revalidated. That's a beat behind, which is exactly
   * right: it means we alert with the preview the server actually resolved for
   * this viewer rather than guessing.
   */
  const alertRef = useRef<(chatId: string) => void>(() => {});

  // Assigned in an effect, not during render: a ref written while rendering is
  // a side effect React is free to run twice.
  useEffect(() => {
    alertRef.current = (chatId: string) => {
      if (pathname.endsWith(`/chats/${chatId}`)) return; // already open
      const list = cache.get(wppKeys.chats)?.data as
        | { chats: WaChatSummary[] }
        | undefined;
      const chat = list?.chats.find((c) => c.id === chatId);
      // Muted chats stay silent, and your own message must never alert you.
      if (!chat || chat.mutedUntil || chat.lastMessage?.mine !== false) return;

      playIncomingTone();
      notifyIncoming({
        title: chat.name,
        body: chat.lastMessage?.body || "",
        tag: chat.id,
        icon: chat.avatarUrl,
        onClick: () => router.push(wpp(`/chats/${chat.id}`)),
      });
    };
  }, [pathname, cache, router]);

  const revalidateAll = useCallback(() => {
    // Matcher-only: passing data/options would send SWR down the populateCache
    // path and blank every key to `undefined` first, flashing an empty UI on
    // each reconnect. This form just refetches.
    void mutate((key) => typeof key === "string" && key.startsWith(WPP_API));
  }, [mutate]);

  useEffect(() => {
    const source = new EventSource(`${WPP_API}/events`);

    source.onopen = () => {
      setConnected(true);
      revalidateAll();
    };

    source.onerror = () => {
      // EventSource retries on its own; surface the gap, don't tear anything down.
      setConnected(false);
    };

    source.onmessage = (e) => {
      let event: WppEvent;
      try {
        event = JSON.parse(e.data) as WppEvent;
      } catch {
        return;
      }

      switch (event.kind) {
        case "chats":
          void mutate(wppKeys.chats);
          void mutate(wppKeys.archived);
          break;
        case "messages": {
          void mutate(wppKeys.messages(event.chatId));
          // Await the chat-list refetch before alerting. The event is only a
          // signal, so the preview to announce lives in the list — reading it
          // synchronously would inspect the state from *before* this message
          // and, whenever the previous entry was your own, conclude there was
          // nothing to announce at all.
          void mutate(wppKeys.chats).then(() => alertRef.current(event.chatId));
          break;
        }
        case "chat":
          void mutate(wppKeys.chat(event.chatId));
          void mutate(wppKeys.chats);
          break;
        case "receipts":
          // Ticks live on the messages payload, so the timeline is what has to
          // be refetched — the cursors themselves are never sent to the client.
          void mutate(wppKeys.messages(event.chatId));
          void mutate(wppKeys.chats);
          break;
        case "presence":
          void mutate(wppKeys.chats);
          void mutate(wppKeys.contacts);
          break;
        case "contacts":
          void mutate(wppKeys.contacts);
          void mutate(wppKeys.blocks);
          void mutate(wppKeys.chats);
          break;
        case "status":
          void mutate(wppKeys.status);
          break;
        case "typing": {
          const next: TypingState = {
            ...typingRef.current,
            [event.chatId]: {
              ...typingRef.current[event.chatId],
              [event.userId]: { name: event.name, at: Date.now() },
            },
          };
          typingRef.current = next;
          setTyping(next);
          break;
        }
      }
    };

    return () => source.close();
  }, [mutate, revalidateAll]);

  // Typing indicators lapse on their own: the sender only ever says "still
  // typing", never "stopped", so a closed tab can't leave one stuck on screen.
  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - TYPING_TTL_MS;
      let changed = false;
      const next: TypingState = {};
      for (const [chatId, people] of Object.entries(typingRef.current)) {
        const live: Record<string, TypingEntry> = {};
        for (const [userId, entry] of Object.entries(people)) {
          if (entry.at > cutoff) live[userId] = entry;
          else changed = true;
        }
        if (Object.keys(live).length > 0) next[chatId] = live;
      }
      if (changed) {
        typingRef.current = next;
        setTyping(next);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, []);

  // Presence heartbeat. Also advances the caller's delivery cursors server-side,
  // which is what turns other people's single ticks into double ones.
  useEffect(() => {
    const beat = () => {
      void fetch(`${WPP_API}/presence`, { method: "POST" }).catch(() => {});
    };
    beat();
    const timer = setInterval(beat, PRESENCE_HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const value = useMemo<RealtimeValue>(
    () => ({ typing, connected }),
    [typing, connected],
  );

  return (
    <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
  );
}

/** Who is currently typing in a chat, excluding nobody — the server already
 *  leaves the sender out of the fan-out. */
export function useTypingIn(chatId: string | null): { id: string; name: string }[] {
  const { typing } = useContext(RealtimeContext);
  return useMemo(() => {
    if (!chatId) return [];
    const people = typing[chatId];
    if (!people) return [];
    return Object.entries(people).map(([id, entry]) => ({ id, name: entry.name }));
  }, [typing, chatId]);
}

export function useWppConnected(): boolean {
  return useContext(RealtimeContext).connected;
}
