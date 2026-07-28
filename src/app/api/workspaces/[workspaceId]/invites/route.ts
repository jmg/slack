import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { requireWorkspaceMember } from "@/lib/data";
import { getOrCreateInvite } from "@/lib/invites";
import { assertSameOrigin } from "@/lib/csrf";

/**
 * Get (or create) the workspace's active invite link. ADMINs only. Pass
 * `{ regenerate: true }` to revoke the current link and mint a fresh one.
 */
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
      return apiError("Only a workspace admin can invite people", 403);
    }

    const body = await req.json().catch(() => ({}));
    const regenerate = body?.regenerate === true;

    if (regenerate) {
      // Revoke any current link so getOrCreateInvite mints a fresh one.
      await prisma.invite.updateMany({
        where: { workspaceId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    const invite = await getOrCreateInvite(workspaceId, user.id);

    return NextResponse.json({
      token: invite.token,
      expiresAt: invite.expiresAt.toISOString(),
    });
  });
}
