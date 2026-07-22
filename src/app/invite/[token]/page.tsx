import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AcceptInvite } from "@/components/accept-invite";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Invitees need an account first — send them to register, then back here.
  const user = await getCurrentUser();
  if (!user) redirect(`/register?next=/invite/${token}`);

  const invite = await prisma.invite.findUnique({
    where: { token },
    select: {
      workspaceId: true,
      revokedAt: true,
      expiresAt: true,
      workspace: { select: { name: true } },
    },
  });

  const valid = invite && !invite.revokedAt && invite.expiresAt > new Date();
  if (!valid) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">Invite not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This invite link is invalid or has expired. Ask whoever invited you for
          a fresh link.
        </p>
        <Link
          href="/workspaces"
          className="mt-6 inline-block text-sm font-medium underline-offset-4 hover:underline"
        >
          Go to your workspaces
        </Link>
      </Shell>
    );
  }

  // Already in? Skip straight to the workspace.
  const existing = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id },
    },
    select: { id: true },
  });
  if (existing) redirect(`/w/${invite.workspaceId}`);

  return (
    <Shell>
      <AcceptInvite token={token} workspaceName={invite.workspace.name} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-background p-8 text-center shadow-sm">
        {children}
      </div>
    </div>
  );
}
