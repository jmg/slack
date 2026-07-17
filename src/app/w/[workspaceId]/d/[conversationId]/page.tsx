import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { requireConversationMember } from "@/lib/data";
import { prisma } from "@/lib/prisma";
import { ChatView } from "@/components/chat-view";

export default async function DmPage({
  params,
}: {
  params: Promise<{ workspaceId: string; conversationId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { workspaceId, conversationId } = await params;

  const ok = await requireConversationMember(user.id, conversationId).catch(
    () => null,
  );
  if (!ok) notFound();

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, image: true } } },
      },
    },
  });

  const others = conversation.members
    .map((m) => m.user)
    .filter((u) => u.id !== user.id);
  const display =
    others.length > 0 ? others : conversation.members.map((m) => m.user);
  const title = display.map((u) => u.name).join(", ");
  const avatar = display[0]
    ? { name: display[0].name, image: display[0].image }
    : undefined;

  return (
    <ChatView
      messagesUrl={`/api/conversations/${conversationId}/messages`}
      currentUserId={user.id}
      workspaceId={workspaceId}
      title={title}
      iconType="dm"
      avatar={avatar}
      placeholder={`Message ${title}`}
    />
  );
}
