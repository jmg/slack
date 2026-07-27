import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { requireChannelAccess } from "@/lib/data";
import { ChatView } from "@/components/chat-view";

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ workspaceId: string; channelId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { workspaceId, channelId } = await params;

  const channel = await requireChannelAccess(user.id, channelId).catch(() => null);
  if (!channel) notFound();

  // `members` is pre-filtered to the current user, so a non-empty list means
  // they've joined. Non-members can read a public channel but must join to post.
  const isMember = channel.members.length > 0;

  return (
    <ChatView
      messagesUrl={`/api/channels/${channel.id}/messages`}
      currentUserId={user.id}
      workspaceId={workspaceId}
      title={channel.name}
      subtitle={channel.description ?? undefined}
      iconType={channel.isPrivate ? "lock" : "hash"}
      channelId={channel.id}
      isMember={isMember}
      placeholder={`Message #${channel.name}`}
    />
  );
}
