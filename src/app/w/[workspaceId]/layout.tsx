import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WorkspaceRail } from "@/components/workspace-rail";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { PresenceHeartbeat } from "@/components/presence-heartbeat";
import { WorkspaceRealtime } from "@/components/workspace-realtime";
import { isOnline } from "@/lib/mentions";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { workspaceId } = await params;

  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    include: { workspace: { select: { id: true, name: true } } },
  });
  if (!membership) redirect("/workspaces");

  const [workspaces, channels, conversationsRaw, membersRaw] = await Promise.all([
    prisma.workspace.findMany({
      where: { members: { some: { userId: user.id } } },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    }),
    prisma.channel.findMany({
      where: {
        workspaceId,
        OR: [{ isPrivate: false }, { members: { some: { userId: user.id } } }],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, isPrivate: true },
    }),
    prisma.conversation.findMany({
      where: { workspaceId, members: { some: { userId: user.id } } },
      orderBy: { createdAt: "asc" },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, image: true } } },
        },
      },
    }),
    prisma.workspaceMember.findMany({
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
    }),
  ]);

  const conversations = conversationsRaw.map((c) => {
    const others = c.members.map((m) => m.user).filter((u) => u.id !== user.id);
    const display = others.length > 0 ? others : c.members.map((m) => m.user);
    return {
      id: c.id,
      name: display.map((u) => u.name).join(", "),
      users: display,
      isSelf: others.length === 0,
    };
  });

  const members = membersRaw.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
    image: m.user.image,
    role: m.role,
    isMe: m.user.id === user.id,
    online: isOnline(m.user.lastSeenAt),
  }));

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <PresenceHeartbeat workspaceId={workspaceId} />
      <WorkspaceRealtime workspaceId={workspaceId} />
      <WorkspaceRail workspaces={workspaces} activeId={workspaceId} />
      <WorkspaceSidebar
        workspace={membership.workspace}
        channels={channels}
        conversations={conversations}
        members={members}
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        }}
      />
      <main className="flex min-w-0 flex-1 flex-col bg-background">
        {children}
      </main>
    </div>
  );
}
