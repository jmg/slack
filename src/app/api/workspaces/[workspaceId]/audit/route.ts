import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { requireWorkspaceMember } from "@/lib/data";

/** Recent audit entries scoped to this workspace. Admins only. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { workspaceId } = await params;
    const membership = await requireWorkspaceMember(user.id, workspaceId);
    if (membership.role !== "ADMIN") return apiError("Admins only", 403);

    const entries = await prisma.auditLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const actorIds = [
      ...new Set(entries.flatMap((e) => (e.actorId ? [e.actorId] : []))),
    ];
    const actors = await prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true },
    });
    const actorName = new Map(actors.map((a) => [a.id, a.name]));

    return NextResponse.json(
      entries.map((e) => ({
        id: e.id,
        action: e.action,
        actor: e.actorId ? (actorName.get(e.actorId) ?? "Unknown") : "—",
        targetType: e.targetType,
        targetId: e.targetId,
        createdAt: e.createdAt.toISOString(),
      })),
    );
  });
}
