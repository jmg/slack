import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsView } from "@/components/settings-view";

export default async function SettingsPage({
  params,
}: {
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

  return (
    <SettingsView
      workspaceId={workspaceId}
      workspaceName={membership.workspace.name}
      isAdmin={membership.role === "ADMIN"}
      emailNotifications={user.emailNotifications}
      chatTheme={user.chatTheme}
    />
  );
}
