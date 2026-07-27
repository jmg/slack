import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, apiError, handle, requireUser } from "@/lib/api";
import { requireWorkspaceMember } from "@/lib/data";
import { assertSameOrigin } from "@/lib/csrf";
import { recordAudit } from "@/lib/audit";

const roleSchema = z.object({ role: z.enum(["ADMIN", "MEMBER"]) });

async function requireAdmin(actorId: string, workspaceId: string) {
  const membership = await requireWorkspaceMember(actorId, workspaceId);
  if (membership.role !== "ADMIN") {
    throw new ApiError("Only a workspace admin can manage members", 403);
  }
}

async function adminCount(workspaceId: string) {
  return prisma.workspaceMember.count({ where: { workspaceId, role: "ADMIN" } });
}

/** Change a member's role (promote to admin / demote to member). Admin only. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; userId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await requireUser();
    const { workspaceId, userId } = await params;
    await requireAdmin(actor.id, workspaceId);

    const parsed = roleSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("Pick a valid role");
    const { role } = parsed.data;

    const target = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!target) return apiError("That person isn't in this workspace", 404);

    // Never leave a workspace with zero admins.
    if (target.role === "ADMIN" && role === "MEMBER" && (await adminCount(workspaceId)) <= 1) {
      return apiError("A workspace needs at least one admin", 400);
    }

    await prisma.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId } },
      data: { role },
    });
    recordAudit({
      action: role === "ADMIN" ? "workspace.role_promote" : "workspace.role_demote",
      actorId: actor.id,
      workspaceId,
      targetType: "user",
      targetId: userId,
    });
    return NextResponse.json({ userId, role });
  });
}

/** Remove someone from the workspace. Admin only. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; userId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(req);
    const actor = await requireUser();
    const { workspaceId, userId } = await params;
    await requireAdmin(actor.id, workspaceId);

    const target = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!target) return apiError("That person isn't in this workspace", 404);

    if (target.role === "ADMIN" && (await adminCount(workspaceId)) <= 1) {
      return apiError("You can't remove the last admin — promote someone first", 400);
    }

    // Drop workspace membership plus their channel memberships + read cursors in
    // this workspace. Their authored messages stay (attributed), like Slack.
    await prisma.$transaction([
      prisma.channelMember.deleteMany({
        where: { userId, channel: { workspaceId } },
      }),
      prisma.readState.deleteMany({
        where: { userId, channel: { workspaceId } },
      }),
      prisma.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId, userId } },
      }),
    ]);
    recordAudit({
      action: "workspace.member_remove",
      actorId: actor.id,
      workspaceId,
      targetType: "user",
      targetId: userId,
    });
    return NextResponse.json({ ok: true });
  });
}
