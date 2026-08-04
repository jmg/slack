import { ChatListPanel } from "@/components/wpp/chat-list-panel";

/**
 * Chat list + whatever is selected.
 *
 * The list lives in the *layout* rather than the page so switching between
 * conversations doesn't remount it — the scroll position, the search box and
 * the filter pills all survive navigation, which is what makes clicking through
 * chats feel instant.
 */
export default function WppChatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ChatListPanel />
      {children}
    </>
  );
}
