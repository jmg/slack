// The network's own error tracker. The DSN's public key is client-embeddable
// by design (same model as Sentry). NEXT_PUBLIC_JENTRY_DSN overrides it
// ("off" disables reporting) for the browser and the server alike.
export const JENTRY_DSN =
  process.env.NEXT_PUBLIC_JENTRY_DSN ??
  "https://5c245f153ea907b68a2f1033b5f473c9@jentry.app/42";

export const JENTRY_ENABLED = JENTRY_DSN.startsWith("http");
