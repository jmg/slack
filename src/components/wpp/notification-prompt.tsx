"use client";

import { useSyncExternalStore } from "react";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/components/wpp/i18n-provider";
import {
  dismissNotificationPrompt,
  requestNotificationPermission,
  shouldOfferNotifications,
  shouldOfferNotificationsOnServer,
  subscribeNotificationPrompt,
} from "@/lib/wpp/notifications";

/**
 * The one-time "turn on notifications" strip above the chat list.
 *
 * Browsers only honour a permission request that comes from a user gesture —
 * and Chrome permanently denies sites that ask without one — so this exists
 * instead of calling `Notification.requestPermission()` on mount.
 *
 * Whether to show it lives in an external store (`lib/wpp/notifications.ts`):
 * both inputs, `Notification.permission` and `localStorage`, are browser-only
 * and change outside React.
 */
export function NotificationPrompt() {
  const t = useT();
  const show = useSyncExternalStore(
    subscribeNotificationPrompt,
    shouldOfferNotifications,
    shouldOfferNotificationsOnServer,
  );

  if (!show) return null;

  async function enable() {
    const result = await requestNotificationPermission();
    if (result === "denied") toast.error(t("notify.blocked"));
  }

  return (
    <div className="flex items-start gap-3 border-b border-[var(--wa-border)] bg-[var(--wa-system)] px-4 py-3 text-[var(--wa-system-ink)]">
      <Bell className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-medium">{t("notify.title")}</p>
        <p className="text-xs opacity-90">{t("notify.body")}</p>
        <div className="mt-1 flex gap-3">
          <button
            type="button"
            onClick={() => void enable()}
            className="text-xs font-semibold text-[var(--wa-green)] underline-offset-2 hover:underline"
          >
            {t("notify.enable")}
          </button>
          <button
            type="button"
            onClick={dismissNotificationPrompt}
            className="text-xs opacity-70 underline-offset-2 hover:underline"
          >
            {t("notify.dismiss")}
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={dismissNotificationPrompt}
        aria-label={t("common.close")}
        className="rounded-full p-1 opacity-70 hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
