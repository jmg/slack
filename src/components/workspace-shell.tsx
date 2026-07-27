"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Responsive frame for the workspace. On desktop the rail + sidebar are always
 * visible. On mobile they collapse into a slide-in drawer behind a hamburger, so
 * the chat gets the full viewport instead of being crushed to a sliver.
 */
export function WorkspaceShell({
  rail,
  sidebar,
  workspaceName,
  children,
}: {
  rail: ReactNode;
  sidebar: ReactNode;
  workspaceName: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes (e.g. tapping a channel). Using
  // the "adjust state during render" pattern rather than an effect avoids a
  // cascading re-render and the set-state-in-effect lint rule.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      {/* Rail + sidebar: static on desktop, an overlay drawer on mobile. */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex shrink-0 transition-transform duration-200 md:static md:translate-x-0",
          open ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0",
        )}
      >
        {rail}
        {sidebar}
      </div>

      {/* Mobile backdrop */}
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <main className="flex min-w-0 flex-1 flex-col bg-background">
        {/* Mobile top bar with the hamburger (desktop hides it). */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3 md:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <Menu className="size-5" />
          </button>
          <span className="truncate font-semibold">{workspaceName}</span>
        </div>
        {children}
      </main>
    </div>
  );
}
