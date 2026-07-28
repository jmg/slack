import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
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

/**
 * Run `mutate` only if the workspace keeps at least one admin, atomically. The
 * count-then-write happens in a SERIALIZABLE transaction so two concurrent
 * demote/remove requests can't both pass a stale count and strand the workspace
 * with zero admins — Postgres aborts one of them (it surfaces as a 500 on the
 * rare conflict, never a lockout).
 */
async function withLastAdminGuard(
  workspaceId: string,
  message: string,
  mutate: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const admins = await tx.workspaceMember.count({
        where: { workspaceId, role: "ADMIN" },
      });
      if (admins <= 1) throw new ApiError(message, 400);
      await mutate(tx);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
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

    const update = (tx: Prisma.TransactionClient) =>
      tx.workspaceMember
        .update({ where: { workspaceId_userId: { workspaceId, userId } }, data: { role } })
        .then(() => undefined);

    // Demoting an admin must keep at least one admin (atomic guard); other role
    // changes have no such constraint.
    if (target.role === "ADMIN" && role === "MEMBER") {
      await withLastAdminGuard(workspaceId, "A workspace needs at least one admin", update);
    } else {
      await update(prisma);
    }
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

    // Drop workspace membership plus their channel memberships + read cursors in
    // this workspace. Their authored messages stay (attributed), like Slack.
    const removeMember = async (tx: Prisma.TransactionClient) => {
      await tx.channelMember.deleteMany({ where: { userId, channel: { workspaceId } } });
      await tx.readState.deleteMany({ where: { userId, channel: { workspaceId } } });
      await tx.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId, userId } } });
    };

    // Removing an admin must keep at least one admin (atomic guard).
    if (target.role === "ADMIN") {
      await withLastAdminGuard(
        workspaceId,
        "You can't remove the last admin — promote someone first",
        removeMember,
      );
    } else {
      await prisma.$transaction((tx) => removeMember(tx));
    }
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
