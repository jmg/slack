"use client";

import { useWorkspaceEvents } from "@/lib/use-workspace-events";

/**
 * Mounts the workspace SSE subscription. Renders nothing — it exists so the
 * server-rendered workspace layout can opt a client subtree into live updates.
 */
export function WorkspaceRealtime({ workspaceId }: { workspaceId: string }) {
  useWorkspaceEvents(workspaceId);
  return null;
}
