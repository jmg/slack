import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { autoJoinDefaultChannels } from "@/lib/data";
import { canAddMember } from "@/lib/billing";
import { FREE_MEMBER_LIMIT } from "@/lib/plans";

/** Join the workspace behind an invite token. Requires being signed in. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { token } = await params;

    const invite = await prisma.invite.findUnique({
      where: { token },
      select: { workspaceId: true, revokedAt: true, expiresAt: true },
    });
    if (!invite || invite.revokedAt || invite.expiresAt < new Date()) {
      return apiError("This invite link is invalid or has expired", 404);
    }

    // Idempotent: opening the link again (or already being a member) is fine.
    const already = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
      select: { id: true },
    });
    if (!already && !(await canAddMember(invite.workspaceId))) {
      return apiError(
        `This workspace is at the Free plan's ${FREE_MEMBER_LIMIT}-member limit. Ask an admin to upgrade to Team.`,
        402,
      );
    }
    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id },
      },
      update: {},
      create: { workspaceId: invite.workspaceId, userId: user.id, role: "MEMBER" },
    });
    await autoJoinDefaultChannels(user.id, invite.workspaceId);
    recordAudit({
      action: "invite.accept",
      actorId: user.id,
      workspaceId: invite.workspaceId,
    });

    return NextResponse.json({ workspaceId: invite.workspaceId });
  });
}
