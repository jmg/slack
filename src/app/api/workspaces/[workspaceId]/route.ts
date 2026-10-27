import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { requireWorkspaceMember } from "@/lib/data";
import { assertSameOrigin } from "@/lib/csrf";
import { createWorkspaceSchema } from "@/lib/validators";

// Same rules as a new workspace's name (no HTML or links: it lands in emails).
const updateSchema = createWorkspaceSchema;

/** Rename a workspace. Workspace ADMINs only. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const { workspaceId } = await params;
    const membership = await requireWorkspaceMember(user.id, workspaceId);
    if (membership.role !== "ADMIN") {
      return apiError("Only a workspace admin can change these settings", 403);
    }

    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { name: parsed.data.name },
    });
    return NextResponse.json({ ok: true });
  });
}
