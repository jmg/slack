import "server-only";

/**
 * Fixed-window, in-process rate limiter. Like the SSE bus, it only sees traffic
 * on this Node process — which is every request today (single web process). If
 * the app is ever scaled out, move this to Redis/Postgres so limits are shared.
 *
 * Held on globalThis so counters survive dev HMR reloads.
 */

type Window = { count: number; resetAt: number };

const globalForRl = globalThis as unknown as { __rateLimit?: Map<string, Window> };
const store: Map<string, Window> = (globalForRl.__rateLimit ??= new Map());

export type RateLimitResult = { allowed: boolean; retryAfter: number };

/** Count one hit on `key`. Returns allowed=false (with a Retry-After in seconds)
 *  once more than `limit` hits land inside `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // Opportunistic sweep so the map can't grow without bound under key churn.
  if (store.size > 5000) {
    for (const [k, w] of store) if (w.resetAt <= now) store.delete(k);
  }

  const win = store.get(key);
  if (!win || win.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  win.count += 1;
  if (win.count > limit) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((win.resetAt - now) / 1000)) };
  }
  return { allowed: true, retryAfter: 0 };
}

/** Best-effort client IP from the proxy chain (Traefik sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
