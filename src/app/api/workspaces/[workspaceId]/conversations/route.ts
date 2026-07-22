import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { createConversationSchema } from "@/lib/validators";
import { requireWorkspaceMember } from "@/lib/data";
import { broadcastConversationCreated } from "@/lib/realtime";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { workspaceId } = await params;
    await requireWorkspaceMember(user.id, workspaceId);

    const conversations = await prisma.conversation.findMany({
      where: { workspaceId, members: { some: { userId: user.id } } },
      orderBy: { createdAt: "asc" },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, image: true } } },
        },
      },
    });

    return NextResponse.json(
      conversations.map((c) => {
        const others = c.members
          .map((m) => m.user)
          .filter((u) => u.id !== user.id);
        const display = others.length > 0 ? others : c.members.map((m) => m.user);
        return {
          id: c.id,
          name: display.map((u) => u.name).join(", "),
          users: display,
          isSelf: others.length === 0,
        };
      }),
    );
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { workspaceId } = await params;
    await requireWorkspaceMember(user.id, workspaceId);

    const json = await req.json().catch(() => null);
    const parsed = createConversationSchema.safeParse(json);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const targetId = parsed.data.userId;

    const targetMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetId } },
    });
    if (!targetMember) {
      return apiError("That person is not in this workspace", 404);
    }

    const userIds =
      targetId === user.id ? [user.id] : [user.id, targetId];

    // Look for an existing conversation with exactly this set of members.
    const mine = await prisma.conversation.findMany({
      where: { workspaceId, members: { some: { userId: user.id } } },
      include: { members: { select: { userId: true } } },
    });
    const want = [...userIds].sort();
    const match = mine.find((c) => {
      const ids = c.members.map((m) => m.userId).sort();
      return ids.length === want.length && ids.every((v, i) => v === want[i]);
    });
    if (match) {
      return NextResponse.json({ id: match.id });
    }

    const conversation = await prisma.conversation.create({
      data: {
        workspaceId,
        members: { create: userIds.map((id) => ({ userId: id })) },
      },
    });
    await broadcastConversationCreated(workspaceId, userIds);
    return NextResponse.json({ id: conversation.id });
  });
}
