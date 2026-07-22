"use client";

import { useEffect, useRef } from "react";
import useSWR from "swr";
import type { UnreadCounts } from "@/lib/types";

/**
 * Passive awareness signals for a backgrounded tab. Reads the same unread data
 * the sidebar does (kept live by the SSE hook) and:
 *  - reflects the unread/mention count in the browser tab title, and
 *  - raises an OS notification when new unread arrives while the tab is hidden.
 * Renders nothing.
 */
export function WorkspaceNotifications({
  workspaceId,
  workspaceName,
}: {
  workspaceId: string;
  workspaceName: string;
}) {
  const { data } = useSWR<UnreadCounts>(`/api/workspaces/${workspaceId}/unread`);

  const sum = (rows: { unread: number; mentions: number }[] | undefined) =>
    (rows ?? []).reduce(
      (a, r) => ({ unread: a.unread + r.unread, mentions: a.mentions + r.mentions }),
      { unread: 0, mentions: 0 },
    );
  const c = sum(data?.channels);
  const d = sum(data?.conversations);
  const unread = c.unread + d.unread;
  const mentions = c.mentions + d.mentions;

  const prevUnread = useRef(unread);
  const asked = useRef(false);

  // Ask for OS-notification permission once (best-effort; may be gesture-gated).
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Tab title badge — mentions take precedence over plain unread.
  useEffect(() => {
    const base = `${workspaceName} · Slack`;
    document.title =
      unread > 0 ? `(${mentions > 0 ? mentions : unread}) ${base}` : base;
  }, [unread, mentions, workspaceName]);

  // OS notification when unread grows while the tab isn't focused.
  useEffect(() => {
    const prev = prevUnread.current;
    prevUnread.current = unread;
    if (
      unread > prev &&
      typeof document !== "undefined" &&
      document.hidden &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      const note = new Notification(workspaceName, {
        body:
          mentions > 0
            ? `You were mentioned — ${unread} unread`
            : `${unread} unread message${unread === 1 ? "" : "s"}`,
        tag: `ws-${workspaceId}`,
      });
      note.onclick = () => {
        window.focus();
        note.close();
      };
    }
  }, [unread, mentions, workspaceId, workspaceName]);

  return null;
}
