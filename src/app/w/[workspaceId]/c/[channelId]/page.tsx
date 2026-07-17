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
  const { channelId } = await params;

  const channel = await requireChannelAccess(user.id, channelId).catch(() => null);
  if (!channel) notFound();

  return (
    <ChatView
      messagesUrl={`/api/channels/${channel.id}/messages`}
      currentUserId={user.id}
      title={channel.name}
      subtitle={channel.description ?? undefined}
      iconType={channel.isPrivate ? "lock" : "hash"}
      placeholder={`Message #${channel.name}`}
    />
  );
}
