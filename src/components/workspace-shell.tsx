"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Lets any descendant (e.g. the chat header) open the mobile sidebar drawer,
 * so we don't need a separate top bar. No-op outside a WorkspaceShell.
 */
const OpenSidebarContext = createContext<() => void>(() => {});
export const useOpenSidebar = () => useContext(OpenSidebarContext);

/**
 * Responsive frame for the workspace. Desktop: rail + sidebar always visible.
 * Mobile: they slide in as an overlay drawer, opened from the chat header's menu
 * button (via useOpenSidebar) — there is no separate mobile top bar.
 */
export function WorkspaceShell({
  rail,
  sidebar,
  children,
}: {
  rail: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer on route change (tapping a channel/DM) without an effect.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  return (
    <OpenSidebarContext.Provider value={() => setOpen(true)}>
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

        {/* Mobile backdrop — tap to close. */}
        {open && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
          />
        )}

        <main className="flex min-w-0 flex-1 flex-col bg-background">{children}</main>
      </div>
    </OpenSidebarContext.Provider>
  );
}
