import "server-only";
import { ApiError } from "@/lib/api";

/**
 * Reject cross-site state-changing requests by checking the Origin header
 * against the request host. Browsers always send Origin on fetch/XHR and on
 * cross-origin form POSTs, so a mismatch means the request did not originate
 * from our own pages. Used to close login/logout CSRF on the unauthenticated
 * auth routes (the data routes are already covered by SameSite=Lax + JSON).
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return; // same-origin navigations / non-browser clients may omit it
  const host = req.headers.get("host");
  let ok = false;
  try {
    ok = new URL(origin).host === host;
  } catch {
    ok = false;
  }
  if (!ok) throw new ApiError("Cross-origin request rejected", 403);
}
