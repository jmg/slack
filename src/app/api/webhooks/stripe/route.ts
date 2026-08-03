import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { clearSubscription, syncSubscription } from "@/lib/billing";

export const runtime = "nodejs";

// Stripe webhook: the source of truth for a workspace's subscription state.
// Signature-verified against STRIPE_WEBHOOK_SECRET on the raw request body.
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "billing not configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig ?? "", secret);
  } catch (err) {
    console.error("stripe webhook: bad signature", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const asSub = (s: Stripe.Subscription) => ({
    id: s.id,
    customer: typeof s.customer === "string" ? s.customer : s.customer.id,
    status: s.status,
    // current_period_end sits on the subscription (older APIs) or its first item.
    current_period_end:
      (s as unknown as { current_period_end?: number }).current_period_end ??
      s.items.data[0]?.current_period_end ??
      Math.floor(Date.now() / 1000),
    metadata: s.metadata as { workspaceId?: string } | null,
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscription(asSub(sub));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await syncSubscription(asSub(event.data.object as Stripe.Subscription));
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        await clearSubscription(customer);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("stripe webhook: handler error", event.type, err);
    return NextResponse.json({ error: "handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
