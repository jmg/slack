import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { requireWorkspaceMember } from "@/lib/data";
import { isOnline } from "@/lib/mentions";
import { addWorkspaceMemberSchema } from "@/lib/validators";
import { assertSameOrigin } from "@/lib/csrf";
import { recordAudit } from "@/lib/audit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { workspaceId } = await params;
    await requireWorkspaceMember(user.id, workspaceId);

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: { user: { name: "asc" } },
      select: {
        role: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            lastSeenAt: true,
          },
        },
      },
    });

    return NextResponse.json(
      members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        role: m.role,
        isMe: m.user.id === user.id,
        online: isOnline(m.user.lastSeenAt),
      })),
    );
  });
}

/**
 * Add an existing account to the workspace by email (admin only, matching who
 * may invite). There's no email delivery here, so we only add people who already
 * have an account; if there's no match, the caller is pointed at the invite link
 * so the person can sign up and join themselves.
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
      return apiError("Only a workspace admin can add people", 403);
    }

    const json = await req.json().catch(() => null);
    const parsed = addWorkspaceMemberSchema.safeParse(json);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { email } = parsed.data;

    const target = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, image: true },
    });
    if (!target) {
      return apiError(
        "No account with that email yet — share the invite link so they can join",
        404,
      );
    }

    const existing = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: target.id } },
    });
    if (existing) {
      return apiError(`${target.name} is already in this workspace`, 409);
    }

    await prisma.workspaceMember.create({
      data: { workspaceId, userId: target.id, role: "MEMBER" },
    });
    recordAudit({
      action: "workspace.member_add",
      actorId: user.id,
      workspaceId,
      targetType: "user",
      targetId: target.id,
    });

    return NextResponse.json({
      id: target.id,
      name: target.name,
      email: target.email,
      image: target.image,
    });
  });
}
