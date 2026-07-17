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
