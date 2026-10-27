import "server-only";
import { prisma } from "@/lib/prisma";
import { effectivePlan } from "@/lib/billing";
import { INVITE_EMAIL_WINDOW_MS, inviteEmailLimit } from "@/lib/email-safety";

/** Audit-log action recording each invitation email we send (it doubles as
 *  the counter for the daily limits, and admins see it in the audit log). */
export const INVITE_EMAIL_ACTION = "workspace.invite_email";

/**
 * Claim one invitation email from `workspaceId` by `inviterId` to `email`.
 * Returns null when it may be sent (and records it), or why not (see
 * inviteEmailLimit in email-safety.ts). One advisory lock serializes the
 * count-then-record, so parallel requests can't overshoot the limits.
 */
export async function reserveInviteEmail(o: {
  workspaceId: string;
  inviterId: string;
  email: string;
}): Promise<string | null> {
  const ws = await prisma.workspace.findUniqueOrThrow({
    where: { id: o.workspaceId },
    select: { plan: true, subscriptionStatus: true, currentPeriodEnd: true },
  });
  const plan = effectivePlan(ws);
  const email = o.email.trim().toLowerCase();

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('talkaroo:invite-email'))`;
    const recent = {
      action: INVITE_EMAIL_ACTION,
      createdAt: { gte: new Date(Date.now() - INVITE_EMAIL_WINDOW_MS) },
    };
    const [workspace, inviter, sameAddress, all] = await Promise.all([
      tx.auditLog.count({ where: { ...recent, workspaceId: o.workspaceId } }),
      tx.auditLog.count({ where: { ...recent, actorId: o.inviterId } }),
      tx.auditLog.count({ where: { ...recent, workspaceId: o.workspaceId, targetId: email } }),
      tx.auditLog.count({ where: recent }),
    ]);
    const refused = inviteEmailLimit({ workspace, inviter, sameAddress, all }, plan);
    if (refused) {
      console.warn(
        `invite email not sent: workspace ${o.workspaceId}, inviter ${o.inviterId}: ${refused}`,
      );
      return refused;
    }
    await tx.auditLog.create({
      data: {
        action: INVITE_EMAIL_ACTION,
        actorId: o.inviterId,
        workspaceId: o.workspaceId,
        targetType: "email",
        targetId: email,
        meta: JSON.stringify({ plan }),
      },
    });
    return null;
  });
}
