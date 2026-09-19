"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isNativeApp, nativePushConfigured } from "@/lib/native";

/**
 * Registers this phone for push and opens the right conversation on a tap.
 *
 * Mounted inside the signed-in app, so there is always a session to register
 * the token against (POST /api/devices). In a browser it does nothing at all —
 * it does not even load Capacitor.
 */
export function NativePush() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    (async () => {
      if (!(await isNativeApp()) || !(await nativePushConfigured()) || cancelled) return;
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");

        const perm = await PushNotifications.checkPermissions();
        const granted =
          perm.receive === "granted" ||
          (await PushNotifications.requestPermissions()).receive === "granted";
        if (!granted || cancelled) return;

        // Android 8+ drops any notification whose channel does not exist, and
        // the server names "messages" (src/lib/push-native.ts).
        await PushNotifications.createChannel({
          id: "messages",
          name: "Messages and mentions",
          description: "Direct messages, and mentions in channels you are in.",
          importance: 4,
          // Private: a locked screen shows that something arrived, not what a
          // teammate wrote, unless the person opts in from system settings.
          visibility: 0,
        }).catch(() => {});

        const registration = await PushNotifications.addListener("registration", ({ value }) => {
          void fetch("/api/devices", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token: value }),
          }).catch(() => {});
        });
        cleanups.push(() => void registration.remove());

        const tap = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          ({ notification }) => {
            const raw = notification.data?.link;
            if (typeof raw !== "string") return;
            try {
              // Only navigate within the app: another origin would take the
              // person out of it without asking.
              const url = new URL(raw, window.location.origin);
              if (url.origin !== window.location.origin) return;
              router.push(url.pathname + url.search);
            } catch {
              /* broken link: ignore */
            }
          },
        );
        cleanups.push(() => void tap.remove());

        // On every launch: FCM rotates tokens, and a stored one is not proof of
        // a live registration. It also re-points the phone if the account changed.
        await PushNotifications.register();
      } catch {
        // Push is an extra: the app works without it.
      }
    })();

    return () => {
      cancelled = true;
      for (const fn of cleanups) fn();
    };
  }, [router]);

  return null;
}
