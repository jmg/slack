export type SidebarChannel = {
  id: string;
  name: string;
  isPrivate: boolean;
};

export type SidebarMember = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  isMe: boolean;
  online?: boolean;
};

/** Per-target unread + mention counts, from /api/workspaces/[id]/unread. */
export type UnreadCounts = {
  channels: { id: string; unread: number; mentions: number }[];
  conversations: { id: string; unread: number; mentions: number }[];
};

export type SidebarConversation = {
  id: string;
  name: string;
  users: { id: string; name: string; image: string | null }[];
  isSelf: boolean;
};

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};
