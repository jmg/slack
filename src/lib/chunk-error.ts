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

/**
 * Reload once to recover from a stale-bundle error, rate-limited so a genuinely
 * broken deploy can't put the tab in a reload loop (at most one reload per
 * window; after that we fall through to the visible error UI).
 */
export function recoverFromChunkError(windowMs = 10_000): boolean {
  if (typeof window === "undefined") return false;
  try {
    const KEY = "slack:lastChunkReload";
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last > windowMs) {
      sessionStorage.setItem(KEY, String(Date.now()));
      window.location.reload();
      return true;
    }
  } catch {
    // sessionStorage blocked (private mode / iframe) — reload once anyway.
    window.location.reload();
    return true;
  }
  return false;
}
