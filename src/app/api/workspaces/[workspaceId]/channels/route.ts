import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { createChannelSchema } from "@/lib/validators";
import { requireWorkspaceMember } from "@/lib/data";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { workspaceId } = await params;
    await requireWorkspaceMember(user.id, workspaceId);

    const channels = await prisma.channel.findMany({
      where: {
        workspaceId,
        OR: [{ isPrivate: false }, { members: { some: { userId: user.id } } }],
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        isPrivate: true,
      },
    });
    return NextResponse.json(channels);
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
    const parsed = createChannelSchema.safeParse(json);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const existing = await prisma.channel.findUnique({
      where: { workspaceId_name: { workspaceId, name: parsed.data.name } },
    });
    if (existing) {
      return apiError("A channel with that name already exists", 409);
    }

    const channel = await prisma.channel.create({
      data: {
        workspaceId,
        name: parsed.data.name,
        description: parsed.data.description,
        isPrivate: parsed.data.isPrivate,
        createdById: user.id,
        members: { create: { userId: user.id } },
      },
      select: { id: true, name: true, description: true, isPrivate: true },
    });

    return NextResponse.json(channel);
  });
}
