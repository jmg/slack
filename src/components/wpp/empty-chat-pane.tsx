"use client";

import { Lock, MessageCircle } from "lucide-react";
import { useT } from "@/components/wpp/i18n-provider";
import { useWppConnected } from "@/components/wpp/realtime-provider";

/**
 * The placeholder beside the chat list when nothing is selected — WhatsApp
 * Web's "keep your phone connected" screen, minus the phone.
 *
 * Hidden on phones: there, the list and the conversation are separate screens,
 * so an empty right-hand pane would just be a blank page.
 */
export function EmptyChatPane() {
  const t = useT();
  const connected = useWppConnected();

  return (
    <div className="hidden flex-1 flex-col items-center justify-center gap-4 border-b-4 border-[var(--wa-green)] bg-[var(--wa-app)] px-8 text-center md:flex">
      <MessageCircle
        className="size-24 text-[var(--wa-divider)]"
        strokeWidth={1}
        aria-hidden
      />
      <h2 className="text-3xl font-light text-[var(--wa-text-dim)]">
        {t("chats.emptyPaneTitle", { app: t("app.name") })}
      </h2>
      <p className="max-w-md text-sm text-[var(--wa-text-dim)]">
        {t("chats.emptyPaneBody")}
      </p>

      {!connected && (
        <p className="rounded-full bg-[var(--wa-system)] px-3 py-1 text-xs text-[var(--wa-system-ink)]">
          {t("error.network")}
        </p>
      )}

      <p className="mt-6 flex items-center gap-1.5 text-xs text-[var(--wa-text-faint)]">
        <Lock className="size-3" />
        {t("chats.emptyPaneSecurity")}
      </p>
    </div>
  );
}
