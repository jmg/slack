import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";

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
    await prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id },
      },
      update: {},
      create: { workspaceId: invite.workspaceId, userId: user.id, role: "MEMBER" },
    });

    return NextResponse.json({ workspaceId: invite.workspaceId });
  });
}
