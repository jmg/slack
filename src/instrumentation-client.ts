// Client-side error tracking → jentry (the network's own error tracker).
// Next.js loads this file automatically in the browser (Next 15+ convention).
// The DSN's public key is client-embeddable by design (same model as Sentry);
// override or disable with NEXT_PUBLIC_JENTRY_DSN ("off" to disable).
import { init } from "@jentry/sdk";
import { JENTRY_DSN, JENTRY_ENABLED } from "@/lib/jentry";

if (JENTRY_ENABLED) {
  init({ dsn: JENTRY_DSN, environment: process.env.NODE_ENV ?? "production" });
}
