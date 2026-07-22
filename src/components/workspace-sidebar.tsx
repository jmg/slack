"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import {
  Archive,
  ChevronDown,
  Hash,
  Lock,
  LogOut,
  Plus,
  MessageSquarePlus,
  Search,
  Settings,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { CreateChannelDialog } from "@/components/create-channel-dialog";
import { NewDmDialog } from "@/components/new-dm-dialog";
import { SearchDialog } from "@/components/search-dialog";
import { cn } from "@/lib/utils";
import type {
  CurrentUser,
  SidebarChannel,
  SidebarConversation,
  SidebarMember,
  UnreadCounts,
} from "@/lib/types";

export function WorkspaceSidebar({
  workspace,
  channels,
  conversations,
  members,
  user,
}: {
  workspace: { id: string; name: string };
  channels: SidebarChannel[];
  conversations: SidebarConversation[];
  members: SidebarMember[];
  user: CurrentUser;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [channelDialog, setChannelDialog] = useState(false);
  const [dmDialog, setDmDialog] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Live, event-driven copies of everything in the rail. The workspace SSE
  // stream (useWorkspaceEvents, mounted in the layout) revalidates these keys as
  // channels, DMs, members and unread counts change — no reload, no fast poll.
  // The one remaining interval is a slow fallback so a user going *offline*
  // (a time-based transition nobody emits an event for) is still reflected.
  const { data: unread } = useSWR<UnreadCounts>(
    `/api/workspaces/${workspace.id}/unread`,
  );
  const { data: liveChannels = channels } = useSWR<SidebarChannel[]>(
    `/api/workspaces/${workspace.id}/channels`,
    { fallbackData: channels },
  );
  const { data: liveConversations = conversations } =
    useSWR<SidebarConversation[]>(
      `/api/workspaces/${workspace.id}/conversations`,
      { fallbackData: conversations },
    );
  const { data: liveMembers = members } = useSWR<SidebarMember[]>(
    `/api/workspaces/${workspace.id}/members`,
    { fallbackData: members, refreshInterval: 60000 },
  );

  const unreadForChannel = new Map(
    (unread?.channels ?? []).map((c) => [c.id, c]),
  );
  const unreadForConversation = new Map(
    (unread?.conversations ?? []).map((c) => [c.id, c]),
  );
  const presenceOf = new Map(liveMembers.map((m) => [m.id, m.online === true]));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-[#3f0e40] text-white/80">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3 text-left outline-none transition hover:bg-white/5">
          <span className="truncate text-[15px] font-bold text-white">
            {workspace.name}
          </span>
          <ChevronDown className="size-4 shrink-0 text-white/80" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="flex flex-col">
            <span className="font-semibold">{user.name}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            render={
              <Link href={`/w/${workspace.id}/settings`}>
                <Settings className="size-4" /> Settings
              </Link>
            }
          />
          <DropdownMenuItem render={<Link href="/workspaces">Switch workspace</Link>} />
          <DropdownMenuItem onClick={signOut} variant="destructive">
            <LogOut className="size-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="px-2 pt-2">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex w-full items-center gap-2 rounded-md bg-white/10 px-2 py-1.5 text-sm text-white/70 transition hover:bg-white/15"
        >
          <Search className="size-3.5" />
          <span>Search</span>
          <kbd className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {/* Channels */}
        <SectionHeader
          label="Channels"
          onAdd={() => setChannelDialog(true)}
          addLabel="Create channel"
        />
        <ul className="mb-4 mt-1 space-y-0.5">
          {liveChannels.map((channel) => {
            const href = `/w/${workspace.id}/c/${channel.id}`;
            const active = pathname === href;
            // While you're viewing a channel it's being marked read anyway.
            const counts = active ? undefined : unreadForChannel.get(channel.id);
            const hasUnread = (counts?.unread ?? 0) > 0;
            return (
              <li key={channel.id}>
                <Link
                  href={href}
                  title={channel.archived ? "Archived channel" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1 text-[15px] transition",
                    active
                      ? "bg-[#1164a3] text-white"
                      : hasUnread
                        ? "font-bold text-white hover:bg-white/10"
                        : "text-white/80 hover:bg-white/10",
                    channel.archived && !active && "opacity-50",
                  )}
                >
                  {channel.archived ? (
                    <Archive className="size-3.5 shrink-0" />
                  ) : channel.isPrivate ? (
                    <Lock className="size-3.5 shrink-0" />
                  ) : (
                    <Hash className="size-3.5 shrink-0" />
                  )}
                  <span className="truncate">{channel.name}</span>
                  <UnreadBadge
                    unread={counts?.unread ?? 0}
                    mentions={counts?.mentions ?? 0}
                  />
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Direct messages */}
        <SectionHeader
          label="Direct messages"
          onAdd={() => setDmDialog(true)}
          addLabel="New message"
          icon={<MessageSquarePlus className="size-4" />}
        />
        <ul className="mt-1 space-y-0.5">
          {liveConversations.map((conv) => {
            const href = `/w/${workspace.id}/d/${conv.id}`;
            const active = pathname === href;
            const other = conv.users[0];
            const counts = active
              ? undefined
              : unreadForConversation.get(conv.id);
            const hasUnread = (counts?.unread ?? 0) > 0;
            return (
              <li key={conv.id}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1 text-[15px] transition",
                    active
                      ? "bg-[#1164a3] text-white"
                      : hasUnread
                        ? "font-bold text-white hover:bg-white/10"
                        : "text-white/80 hover:bg-white/10",
                  )}
                >
                  {other && (
                    <UserAvatar
                      name={other.name}
                      image={other.image}
                      className="size-5 rounded"
                      online={presenceOf.get(other.id) ?? false}
                    />
                  )}
                  <span className="truncate">
                    {conv.name}
                    {conv.isSelf && (
                      <span className="ml-1 text-xs text-white/50">you</span>
                    )}
                  </span>
                  <UnreadBadge
                    unread={counts?.unread ?? 0}
                    mentions={counts?.mentions ?? 0}
                  />
                </Link>
              </li>
            );
          })}
          {liveConversations.length === 0 && (
            <li className="px-2 py-1 text-sm text-white/50">
              No direct messages yet.
            </li>
          )}
        </ul>
      </div>

      <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2.5">
        <UserAvatar name={user.name} image={user.image} className="size-7" />
        <span className="truncate text-sm text-white/90">{user.name}</span>
      </div>

      <CreateChannelDialog
        workspaceId={workspace.id}
        open={channelDialog}
        onOpenChange={setChannelDialog}
      />
      <NewDmDialog
        workspaceId={workspace.id}
        members={liveMembers}
        open={dmDialog}
        onOpenChange={setDmDialog}
      />
      <SearchDialog
        workspaceId={workspace.id}
        open={searchOpen}
        onOpenChange={setSearchOpen}
      />
    </aside>
  );
}

function SectionHeader({
  label,
  onAdd,
  addLabel,
  icon,
}: {
  label: string;
  onAdd: () => void;
  addLabel: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="group flex items-center justify-between px-2 py-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
        {label}
      </span>
      <button
        type="button"
        onClick={onAdd}
        aria-label={addLabel}
        title={addLabel}
        className="flex size-5 items-center justify-center rounded text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        {icon ?? <Plus className="size-4" />}
      </button>
    </div>
  );
}

/** Slack-style badge: red with the mention count, otherwise a plain unread pill. */
function UnreadBadge({ unread, mentions }: { unread: number; mentions: number }) {
  if (unread <= 0) return null;
  const mentioned = mentions > 0;
  const value = mentioned ? mentions : unread;
  return (
    <span
      title={
        mentioned
          ? `${mentions} mention${mentions === 1 ? "" : "s"}`
          : `${unread} unread`
      }
      className={cn(
        "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none",
        mentioned ? "bg-[#e01e5a] text-white" : "bg-white/25 text-white",
      )}
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}
