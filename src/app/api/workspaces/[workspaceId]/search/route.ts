import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser } from "@/lib/api";
import { searchSchema } from "@/lib/validators";
import { requireWorkspaceMember } from "@/lib/data";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { workspaceId } = await params;
    await requireWorkspaceMember(user.id, workspaceId);

    const parsed = searchSchema.safeParse({
      q: req.nextUrl.searchParams.get("q") ?? "",
    });
    if (!parsed.success) {
      return NextResponse.json({ query: "", results: [] });
    }
    const q = parsed.data.q;

    // Channels + conversations the user can see in this workspace.
    const [channels, conversations] = await Promise.all([
      prisma.channel.findMany({
        where: {
          workspaceId,
          OR: [{ isPrivate: false }, { members: { some: { userId: user.id } } }],
        },
        select: { id: true, name: true, isPrivate: true },
      }),
      prisma.conversation.findMany({
        where: { workspaceId, members: { some: { userId: user.id } } },
        include: {
          members: { include: { user: { select: { id: true, name: true } } } },
        },
      }),
    ]);

    const channelMap = new Map(channels.map((c) => [c.id, c]));
    const convMap = new Map(conversations.map((c) => [c.id, c]));

    const messages = await prisma.message.findMany({
      where: {
        // Only top-level messages: replies live inside a thread panel and
        // wouldn't be visible on the channel/DM page a result links to.
        parentId: null,
        deletedAt: null,
        body: { contains: q, mode: "insensitive" },
        OR: [
          { channelId: { in: [...channelMap.keys()] } },
          { conversationId: { in: [...convMap.keys()] } },
        ],
      },
      include: { user: { select: { id: true, name: true, image: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const results = messages.map((m) => {
      if (m.channelId && channelMap.has(m.channelId)) {
        const ch = channelMap.get(m.channelId)!;
        return {
          id: m.id,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
          author: m.user,
          context: {
            type: "channel" as const,
            name: `#${ch.name}`,
            href: `/w/${workspaceId}/c/${ch.id}?msg=${m.id}`,
            isPrivate: ch.isPrivate,
          },
        };
      }
      const conv = convMap.get(m.conversationId!)!;
      const others = conv.members
        .map((mem) => mem.user)
        .filter((u) => u.id !== user.id);
      const display = others.length > 0 ? others : conv.members.map((mem) => mem.user);
      return {
        id: m.id,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        author: m.user,
        context: {
          type: "dm" as const,
          name: display.map((u) => u.name).join(", "),
          href: `/w/${workspaceId}/d/${conv.id}?msg=${m.id}`,
          isPrivate: true,
        },
      };
    });

    return NextResponse.json({ query: q, results });
  });
}
