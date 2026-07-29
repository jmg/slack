"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** Opt-in Web Push toggle: registers the push service worker on demand and
 *  stores the subscription server-side. Hidden on browsers that can't do push. */
export function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (cancelled) return;
      setSupported(ok);
      if (!ok) {
        // iOS only exposes the Push API inside a Home-Screen web app. If we're on
        // iPhone/iPad in the browser, tell the user to install it first.
        const ua = navigator.userAgent || "";
        const isIOS =
          /iphone|ipad|ipod/i.test(ua) ||
          (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
        const standalone =
          window.matchMedia("(display-mode: standalone)").matches ||
          (navigator as Navigator & { standalone?: boolean }).standalone === true;
        setIosHint(isIOS && !standalone);
        return;
      }
      try {
        const d = await (await fetch("/api/push/vapid")).json();
        if (cancelled) return;
        setConfigured(Boolean(d.configured));
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (!cancelled) setEnabled(Boolean(sub));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error("Notifications are blocked — allow them in your browser settings");
        return;
      }
      const { key } = await (await fetch("/api/push/vapid")).json();
      if (!key) {
        toast.error("Push isn't configured on this server");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("save failed");
      setEnabled(true);
      toast.success("Push notifications on for this device");
    } catch {
      toast.error("Could not enable push notifications");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
          method: "DELETE",
        });
        await sub.unsubscribe();
      }
      setEnabled(false);
      toast.success("Push notifications off");
    } catch {
      toast.error("Could not turn off push notifications");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    if (!iosHint) return null;
    return (
      <div className="mt-4 flex items-start gap-3 rounded-md bg-muted/50 p-3">
        <Bell className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Notifications on iPhone need Talkaroo on your Home Screen.
          </span>{" "}
          In Safari, tap the Share button → <strong>Add to Home Screen</strong>, then
          open Talkaroo from your home screen and turn on notifications here.
        </span>
      </div>
    );
  }

  return (
    <label className="mt-4 flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={enabled}
        disabled={busy || !configured}
        onChange={(e) => (e.target.checked ? enable() : disable())}
        className="mt-1 size-4 accent-[#611f69]"
      />
      <span className="flex flex-col">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Bell className="size-4" /> Push notifications on this device
        </span>
        <span className="text-xs text-muted-foreground">
          {configured
            ? "Get a notification for mentions & DMs even when the app is closed."
            : "Not available on this server yet."}
        </span>
      </span>
    </label>
  );
}
