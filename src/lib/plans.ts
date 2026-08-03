// Plan definitions. Dependency-free so client and server can both import it.
export type PlanId = "free" | "team";

/** Team price, per seat (member) per month, in USD — aggressively below Slack. */
export const TEAM_PRICE_USD = 2;

/** Free workspaces are capped here; Team is unlimited. */
export const FREE_MEMBER_LIMIT = 10;

export const PLANS: Record<PlanId, { id: PlanId; name: string; memberLimit: number }> = {
  free: { id: "free", name: "Free", memberLimit: FREE_MEMBER_LIMIT },
  team: { id: "team", name: "Team", memberLimit: Infinity },
};

/** A Stripe subscription status that grants the paid plan. */
export function isPaidStatus(status?: string | null): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}
