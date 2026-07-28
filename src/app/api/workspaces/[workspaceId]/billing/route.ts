import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser } from "@/lib/api";
import { requireWorkspaceMember } from "@/lib/data";
import { effectivePlan, seatCount } from "@/lib/billing";
import { billingConfigured } from "@/lib/stripe";
import { TEAM_PRICE_USD, FREE_MEMBER_LIMIT } from "@/lib/plans";

/** Billing summary for the workspace, for the settings panel. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { workspaceId } = await params;
    const membership = await requireWorkspaceMember(user.id, workspaceId);

    const ws = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: {
        plan: true,
        subscriptionStatus: true,
        currentPeriodEnd: true,
        stripeCustomerId: true,
      },
    });
    const [plan, seats] = [effectivePlan(ws), await seatCount(workspaceId)];

    return NextResponse.json({
      plan,
      status: ws.subscriptionStatus,
      currentPeriodEnd: ws.currentPeriodEnd,
      seats,
      pricePerSeat: TEAM_PRICE_USD,
      monthlyTotal: TEAM_PRICE_USD * seats,
      freeLimit: FREE_MEMBER_LIMIT,
      configured: billingConfigured(),
      isAdmin: membership.role === "ADMIN",
      hasCustomer: Boolean(ws.stripeCustomerId),
    });
  });
}
