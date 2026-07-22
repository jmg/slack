import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { requireWorkspaceMember } from "@/lib/data";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Get (or create) the workspace's active invite link. ADMINs only. Pass
 * `{ regenerate: true }` to revoke the current link and mint a fresh one.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { workspaceId } = await params;
    const membership = await requireWorkspaceMember(user.id, workspaceId);
    if (membership.role !== "ADMIN") {
      return apiError("Only a workspace admin can invite people", 403);
    }

    const body = await req.json().catch(() => ({}));
    const regenerate = body?.regenerate === true;
    const now = new Date();

    let invite = await prisma.invite.findFirst({
      where: { workspaceId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });

    if (regenerate && invite) {
      await prisma.invite.update({
        where: { id: invite.id },
        data: { revokedAt: now },
      });
      invite = null;
    }

    if (!invite) {
      invite = await prisma.invite.create({
        data: {
          workspaceId,
          token: randomBytes(18).toString("base64url"),
          createdById: user.id,
          expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
        },
      });
    }

    return NextResponse.json({
      token: invite.token,
      expiresAt: invite.expiresAt.toISOString(),
    });
  });
}
