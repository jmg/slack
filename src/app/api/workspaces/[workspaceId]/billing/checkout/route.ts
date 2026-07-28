import { NextRequest, NextResponse } from "next/server";
import { apiError, handle, requireUser } from "@/lib/api";
import { requireWorkspaceMember } from "@/lib/data";
import { assertSameOrigin } from "@/lib/csrf";
import { getStripe, teamPriceId } from "@/lib/stripe";
import { ensureStripeCustomer, seatCount } from "@/lib/billing";
import { appBaseUrl } from "@/lib/invites";

/** Start a Stripe Checkout session to subscribe the workspace to Team (admin). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const { workspaceId } = await params;
    const membership = await requireWorkspaceMember(user.id, workspaceId);
    if (membership.role !== "ADMIN") {
      return apiError("Only a workspace admin can manage billing", 403);
    }

    const stripe = getStripe();
    const price = teamPriceId();
    if (!stripe || !price) return apiError("Billing isn't configured yet", 503);

    const customer = await ensureStripeCustomer(workspaceId);
    const seats = Math.max(1, await seatCount(workspaceId));
    const base = appBaseUrl(req);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price, quantity: seats }],
      allow_promotion_codes: true,
      subscription_data: { metadata: { workspaceId } },
      // Reuse the seat count as the billed quantity but let it be updated later.
      success_url: `${base}/w/${workspaceId}/settings?billing=success`,
      cancel_url: `${base}/w/${workspaceId}/settings?billing=cancel`,
    });

    if (!session.url) return apiError("Could not start checkout", 502);
    return NextResponse.json({ url: session.url });
  });
}
