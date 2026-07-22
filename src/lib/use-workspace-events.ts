"use client";

import { useEffect } from "react";
import { useSWRConfig } from "swr";
import type { WorkspaceEvent } from "@/lib/realtime-types";

/**
 * Opens one SSE stream per workspace and turns each pushed signal into a
 * targeted SWR revalidation — this is what makes the app update without a
 * reload. `EventSource` reconnects on its own if the stream drops; on every
 * (re)connect we revalidate the whole cache to catch anything missed while
 * disconnected.
 */
export function useWorkspaceEvents(workspaceId: string) {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    const source = new EventSource(`/api/workspaces/${workspaceId}/events`);
    const unread = `/api/workspaces/${workspaceId}/unread`;

    source.onopen = () => {
      // (Re)connected — revalidate every cached endpoint we might have missed.
      // Pass ONLY the key matcher: adding data/options args makes SWR take the
      // populateCache path and blank each key to `undefined` first, flashing an
      // empty UI on every reconnect. The matcher-only form just refetches.
      void mutate((key) => typeof key === "string" && key.startsWith("/api/"));
    };

    source.onmessage = (e) => {
      let event: WorkspaceEvent;
      try {
        event = JSON.parse(e.data) as WorkspaceEvent;
      } catch {
        return;
      }

      switch (event.kind) {
        case "message":
          if (event.channelId)
            void mutate(`/api/channels/${event.channelId}/messages`);
          if (event.conversationId)
            void mutate(`/api/conversations/${event.conversationId}/messages`);
          void mutate(unread);
          break;
        case "thread":
          void mutate(`/api/messages/${event.parentId}/thread`);
          // Reply counts / participant avatars live on the parent's timeline.
          if (event.channelId)
            void mutate(`/api/channels/${event.channelId}/messages`);
          if (event.conversationId)
            void mutate(`/api/conversations/${event.conversationId}/messages`);
          void mutate(unread);
          break;
        case "channels":
          void mutate(`/api/workspaces/${workspaceId}/channels`);
          break;
        case "conversations":
          void mutate(`/api/workspaces/${workspaceId}/conversations`);
          break;
        case "members":
          void mutate(`/api/workspaces/${workspaceId}/members`);
          break;
        case "channelMembers":
          void mutate(`/api/channels/${event.channelId}/members`);
          break;
      }
    };

    return () => source.close();
  }, [workspaceId, mutate]);
}
