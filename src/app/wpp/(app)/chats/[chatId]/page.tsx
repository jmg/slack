import { ChatPane } from "@/components/wpp/chat-pane";

// `params` is a Promise in Next 16.
export default async function WppChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  // Keyed so opening another conversation remounts the pane rather than
  // reconciling one chat's scroll position, drafts and pending sends onto
  // another's.
  return <ChatPane key={chatId} chatId={chatId} />;
}
