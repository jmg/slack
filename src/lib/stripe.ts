import "server-only";
import Stripe from "stripe";

// Lazy Stripe client, constructed on first use so `next build` (and any deploy
// without billing configured) never needs STRIPE_SECRET_KEY. Returns null when
// billing isn't configured, so the whole feature degrades gracefully.
let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) client = new Stripe(key);
  return client;
}

/** The Stripe Price id for the Team plan (per-seat subscription). */
export function teamPriceId(): string | undefined {
  return process.env.STRIPE_PRICE_TEAM;
}

/** Billing is usable only when both the secret key and the Team price are set. */
export function billingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_TEAM);
}
