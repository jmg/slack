/**
 * A "chunk load error" happens when a browser tab that was opened before a
 * deploy tries to fetch a JS bundle by its old content hash — the new deploy
 * replaced it, so the request 404s and React throws. The fix is simply to
 * reload the page so the browser fetches the current bundles.
 */
export function isChunkLoadError(error: unknown): boolean {
  const e = error as { name?: string; message?: string; digest?: string } | null;
  const text = `${e?.name ?? ""} ${e?.message ?? ""} ${e?.digest ?? ""}`;
  // Two families of "your tab is out of date after a deploy" errors, both fixed
  // by reloading to the current bundles:
  //  1. Chunk load failures — a JS file was requested by its old content hash.
  //  2. Hydration mismatches — old client JS tried to hydrate new server HTML
  //     (React prod errors #418/#422/#423/#425, or anything mentioning hydration).
  // Application logic errors don't match either pattern, so they still surface.
  return /ChunkLoadError|Loading chunk [\d]+ failed|dynamically imported module|Importing a module script failed|error loading dynamically imported module|Minified React error #(418|422|423|425)|hydrat/i.test(
    text,
  );
}

const RELOAD_PARAM = "__reload";
const MAX_RELOADS = 2;

/** Best-effort: drop any service worker + caches so a stale build can't keep
 *  being served from the client side. Never throws. */
async function purgeClientState(): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
}

/**
 * Recover from a stale-bundle / hydration error by purging client state and
 * reloading — but at most MAX_RELOADS times, tracked via a URL query param so
 * the guard survives the reload WITHOUT needing sessionStorage (which Brave and
 * private modes can block, and which previously caused an infinite reload loop).
 * Once the cap is hit we return false and let the visible error UI show instead.
 */
export function recoverFromChunkError(): boolean {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  const attempts = Number(url.searchParams.get(RELOAD_PARAM) || 0);
  if (!Number.isFinite(attempts) || attempts >= MAX_RELOADS) return false;
  url.searchParams.set(RELOAD_PARAM, String(attempts + 1));
  void purgeClientState().finally(() => window.location.replace(url.toString()));
  return true;
}
