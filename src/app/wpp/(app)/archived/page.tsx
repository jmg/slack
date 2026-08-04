import { ChatListPanel } from "@/components/wpp/chat-list-panel";
import { EmptyChatPane } from "@/components/wpp/empty-chat-pane";

/**
 * The archived shelf reuses the chat list wholesale — same rows, same actions,
 * different query — so archiving and unarchiving behave identically in both.
 */
export default function WppArchivedPage() {
  return (
    <>
      <ChatListPanel variant="archived" />
      <EmptyChatPane />
    </>
  );
}
