"use client";

import { User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { waAvatarColor, waInitials } from "@/lib/wpp/format";

/**
 * Contact / group avatar.
 *
 * Falls back the way WhatsApp does: a neutral silhouette when there's nothing to
 * show, and a group glyph for groups so a photo-less group never looks like a
 * person. Initials only appear when we actually have a name — showing "?" for a
 * deleted account would be worse than the silhouette.
 *
 * Photos are plain `<img>` rather than `next/image`: they're served through our
 * own authorizing proxy at unpredictable ids, so there is nothing for the image
 * optimizer to usefully cache or resize.
 */
export function WaAvatar({
  name,
  avatarUrl,
  group = false,
  size = 48,
  online,
  ring,
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  group?: boolean;
  size?: number;
  /** Renders the green presence dot when defined. */
  online?: boolean;
  /** Status ring: "unseen" | "seen" — used on the Status list. */
  ring?: "unseen" | "seen";
  className?: string;
}) {
  const initials = waInitials(name);
  const Fallback = group ? Users : User;

  const inner = (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: avatarUrl
          ? "transparent"
          : initials
            ? waAvatarColor(name)
            : "var(--wa-divider)",
      }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          width={size}
          height={size}
          className="size-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : initials ? (
        <span
          className="font-medium text-white select-none"
          style={{ fontSize: Math.round(size * 0.38) }}
        >
          {initials}
        </span>
      ) : (
        <Fallback
          style={{ width: Math.round(size * 0.55), height: Math.round(size * 0.55) }}
          className="text-[var(--wa-panel)]"
          aria-hidden
        />
      )}
    </span>
  );

  if (!ring && online === undefined) return inner;

  return (
    <span className="relative inline-flex shrink-0">
      {ring ? (
        <span
          data-seen={ring === "seen"}
          className="wa-status-ring flex items-center justify-center rounded-full p-[2px]"
        >
          <span className="rounded-full bg-[var(--wa-panel)] p-[2px]">{inner}</span>
        </span>
      ) : (
        inner
      )}
      {online !== undefined && (
        <span
          aria-hidden
          className={cn(
            "absolute right-0 bottom-0 size-3 rounded-full ring-2 ring-[var(--wa-panel)]",
            online ? "bg-[var(--wa-badge)]" : "bg-transparent ring-0",
          )}
        />
      )}
    </span>
  );
}
