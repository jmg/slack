// Client-side error tracking → jentry (the network's own error tracker).
// Next.js loads this file automatically in the browser (Next 15+ convention).
// The DSN's public key is client-embeddable by design (same model as Sentry);
// override or disable with NEXT_PUBLIC_JENTRY_DSN ("off" to disable).
import { init } from "@jentry/sdk";

const DSN =
  process.env.NEXT_PUBLIC_JENTRY_DSN ??
  "https://5c245f153ea907b68a2f1033b5f473c9@jentry.app/42";

if (DSN.startsWith("http")) {
  init({ dsn: DSN, environment: process.env.NODE_ENV ?? "production" });
}
