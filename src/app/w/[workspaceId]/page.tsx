import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function WorkspaceIndex({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { workspaceId } = await params;

  const channel =
    (await prisma.channel.findFirst({
      where: { workspaceId, name: "general" },
      select: { id: true },
    })) ??
    (await prisma.channel.findFirst({
      where: {
        workspaceId,
        OR: [{ isPrivate: false }, { members: { some: { userId: user.id } } }],
      },
      orderBy: { name: "asc" },
      select: { id: true },
    }));

  if (channel) redirect(`/w/${workspaceId}/c/${channel.id}`);

  return (
    <div className="flex flex-1 items-center justify-center text-muted-foreground">
      No channels yet — create one from the sidebar.
    </div>
  );
}
