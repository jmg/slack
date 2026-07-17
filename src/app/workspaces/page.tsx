import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WorkspaceLauncher } from "@/components/workspace-launcher";

export default async function WorkspacesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspaces = await prisma.workspace.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true },
  });

  return (
    <WorkspaceLauncher
      user={{ name: user.name, email: user.email }}
      workspaces={workspaces}
    />
  );
}
