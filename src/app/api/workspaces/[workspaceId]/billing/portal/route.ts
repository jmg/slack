import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { requireWorkspaceMember } from "@/lib/data";
import { assertSameOrigin } from "@/lib/csrf";
import { getStripe } from "@/lib/stripe";
import { appBaseUrl } from "@/lib/invites";

/** Open the Stripe billing portal so an admin can update payment, change seats
 *  or cancel. Requires an existing customer (i.e. they've subscribed before). */
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
    if (!stripe) return apiError("Billing isn't configured yet", 503);

    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { stripeCustomerId: true },
    });
    if (!ws.stripeCustomerId) return apiError("No billing account yet — subscribe first", 400);

    const session = await stripe.billingPortal.sessions.create({
      customer: ws.stripeCustomerId,
      return_url: `${appBaseUrl(req)}/w/${workspaceId}/settings`,
    });
    return NextResponse.json({ url: session.url });
  });
}
