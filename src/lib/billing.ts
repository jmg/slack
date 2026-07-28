import "server-only";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { FREE_MEMBER_LIMIT, isPaidStatus, type PlanId } from "@/lib/plans";

type WorkspaceBillingRow = {
  plan: string;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
};

/** The plan a workspace effectively has right now. A canceled subscription keeps
 *  "team" until the paid period it already paid for runs out. */
export function effectivePlan(ws: WorkspaceBillingRow): PlanId {
  if (ws.plan === "team" && isPaidStatus(ws.subscriptionStatus)) return "team";
  if (ws.currentPeriodEnd && ws.currentPeriodEnd.getTime() > Date.now()) {
    // Paid through the current period even if canceled/ended.
    if (ws.plan === "team") return "team";
  }
  return "free";
}

/** The workspace's Stripe customer id, creating the customer on first use. */
export async function ensureStripeCustomer(workspaceId: string): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new Error("billing not configured");
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { id: true, name: true, ownerId: true, stripeCustomerId: true },
  });
  if (ws.stripeCustomerId) return ws.stripeCustomerId;
  const owner = await prisma.user.findUnique({
    where: { id: ws.ownerId },
    select: { email: true, name: true },
  });
  const customer = await stripe.customers.create({
    name: ws.name,
    email: owner?.email ?? undefined,
    metadata: { workspaceId },
  });
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/** Seats billed = member count. */
export function seatCount(workspaceId: string): Promise<number> {
  return prisma.workspaceMember.count({ where: { workspaceId } });
}

/** Whether the workspace can add another member under its current plan. Free is
 *  capped at FREE_MEMBER_LIMIT; Team is unlimited. Existing over-limit
 *  workspaces are grandfathered — this only blocks *new* additions. */
export async function canAddMember(workspaceId: string): Promise<boolean> {
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { id: workspaceId },
    select: { plan: true, subscriptionStatus: true, currentPeriodEnd: true },
  });
  if (effectivePlan(ws) === "team") return true;
  return (await seatCount(workspaceId)) < FREE_MEMBER_LIMIT;
}

/** Apply a Stripe subscription's state to the workspace it belongs to. Used by
 *  the webhook. Resolves the workspace by customer id, then subscription metadata. */
export async function syncSubscription(sub: {
  id: string;
  customer: string;
  status: string;
  current_period_end: number;
  metadata?: { workspaceId?: string } | null;
}): Promise<void> {
  const workspace =
    (await prisma.workspace.findUnique({ where: { stripeCustomerId: sub.customer } })) ??
    (sub.metadata?.workspaceId
      ? await prisma.workspace.findUnique({ where: { id: sub.metadata.workspaceId } })
      : null);
  if (!workspace) return;

  const active = isPaidStatus(sub.status);
  await prisma.workspace.update({
    where: { id: workspace.id },
    data: {
      stripeCustomerId: sub.customer,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      plan: active ? "team" : "free",
    },
  });
}

/** A subscription was deleted (fully ended): drop the workspace to free. */
export async function clearSubscription(customerId: string): Promise<void> {
  const workspace = await prisma.workspace.findUnique({
    where: { stripeCustomerId: customerId },
  });
  if (!workspace) return;
  await prisma.workspace.update({
    where: { id: workspace.id },
    data: { plan: "free", subscriptionStatus: "canceled", stripeSubscriptionId: null },
  });
}
