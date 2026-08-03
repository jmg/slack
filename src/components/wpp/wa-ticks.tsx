"use client";

import { Check, CheckCheck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/wpp/i18n-provider";
import type { WaTick } from "@/lib/wpp/types";

/**
 * The delivery ticks on a message you sent.
 *
 * One grey tick = written down. Two grey = every recipient's client has it. Two
 * blue = every recipient has read it. `null` means "not sent yet" and shows the
 * clock, which is what an optimistic bubble renders until the POST returns.
 *
 * The state itself is computed server-side (`computeTick` in
 * `lib/wpp/messages.ts`) because it depends on cursors the client never sees —
 * this component only paints it.
 */
export function WaTicks({
  tick,
  pending = false,
  className,
}: {
  tick: WaTick | null;
  pending?: boolean;
  className?: string;
}) {
  const t = useT();

  if (pending) {
    return (
      <Clock
        aria-hidden
        className={cn("size-3.5 text-[var(--wa-tick)] opacity-70", className)}
      />
    );
  }
  if (!tick) return null;

  const label =
    tick === "read"
      ? t("message.readBy")
      : tick === "delivered"
        ? t("message.deliveredTo")
        : t("message.sent");

  const Icon = tick === "sent" ? Check : CheckCheck;

  return (
    <Icon
      role="img"
      aria-label={label}
      className={cn(
        "size-4",
        tick === "read" ? "text-[var(--wa-tick-read)]" : "text-[var(--wa-tick)]",
        className,
      )}
    />
  );
}
