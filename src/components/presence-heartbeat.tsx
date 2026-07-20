"use client";

import { useEffect } from "react";

const HEARTBEAT_MS = 60_000;

/**
 * Keeps the current user's `lastSeenAt` fresh so teammates see them online.
 * Renders nothing; mounted once inside the workspace shell.
 */
export function PresenceHeartbeat() {
  useEffect(() => {
    const ping = () => {
      void fetch("/api/presence", { method: "POST" }).catch(() => {});
    };
    ping();
    const id = setInterval(ping, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
