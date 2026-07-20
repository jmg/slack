import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { createWorkspaceSchema } from "@/lib/validators";
import { uniqueWorkspaceSlug } from "@/lib/data";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const workspaces = await prisma.workspace.findMany({
      where: { members: { some: { userId: user.id } } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, slug: true, imageUrl: true },
    });
    return NextResponse.json(workspaces);
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const json = await req.json().catch(() => null);
    const parsed = createWorkspaceSchema.safeParse(json);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const slug = await uniqueWorkspaceSlug(parsed.data.name);

    const workspace = await prisma.workspace.create({
      data: {
        name: parsed.data.name,
        slug,
        ownerId: user.id,
        members: { create: { userId: user.id, role: "ADMIN" } },
        channels: {
          create: {
            name: "general",
            createdById: user.id,
            description: "This is the one channel that everyone is in.",
            members: { create: { userId: user.id } },
          },
        },
      },
      include: { channels: { select: { id: true } } },
    });

    return NextResponse.json({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      defaultChannelId: workspace.channels[0]?.id ?? null,
    });
  });
}
