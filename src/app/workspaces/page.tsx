import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WorkspaceLauncher } from "@/components/workspace-launcher";
import { NativePush } from "@/components/native-push";

export default async function WorkspacesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspaces = await prisma.workspace.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true },
  });

  return (
    <>
      {/* The APK opens here, and this page is outside the workspace layout: a
          phone would not register its token until the person walked into a
          workspace, which is exactly when they stop needing to be told. */}
      <NativePush />
      <WorkspaceLauncher
      user={{ name: user.name, email: user.email }}
      workspaces={workspaces}
      />
    </>
  );
}
