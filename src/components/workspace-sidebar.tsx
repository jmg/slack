"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Hash,
  Lock,
  LogOut,
  Plus,
  MessageSquarePlus,
  Search,
  Settings,
  Star,
  UserPlus,
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
import { InviteDialog } from "@/components/invite-dialog";
import { QuickSwitcher } from "@/components/quick-switcher";
import { cn } from "@/lib/utils";
import type {
  CurrentUser,
  SidebarChannel,
  SidebarConversation,
  SidebarMember,
  UnreadCounts,
} from "@/lib/types";
import type { ChatTheme } from "@/lib/themes";

type Stars = { channelIds: string[]; conversationIds: string[] };

export function WorkspaceSidebar({
  workspace,
  channels,
  conversations,
  members,
  theme,
  user,
}: {
  workspace: { id: string; name: string };
  channels: SidebarChannel[];
  conversations: SidebarConversation[];
  members: SidebarMember[];
  theme: ChatTheme;
  user: CurrentUser;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [channelDialog, setChannelDialog] = useState(false);
  const [dmDialog, setDmDialog] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  // Which sections are collapsed (in-memory; persists across client nav).
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleSection = (label: string) =>
    setCollapsed((c) => ({ ...c, [label]: !c[label] }));

  // Live, event-driven copies of everything in the rail (revalidated by the SSE
  // hook in the layout). The one interval is a slow fallback for offline detection.
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
  const { data: stars, mutate: mutateStars } = useSWR<Stars>(
    `/api/workspaces/${workspace.id}/stars`,
  );

  const unreadForChannel = new Map((unread?.channels ?? []).map((c) => [c.id, c]));
  const unreadForConversation = new Map(
    (unread?.conversations ?? []).map((c) => [c.id, c]),
  );
  const presenceOf = new Map(liveMembers.map((m) => [m.id, m.online === true]));
  const isAdmin = liveMembers.some((m) => m.isMe && m.role === "ADMIN");

  const starredChannels = new Set(stars?.channelIds ?? []);
  const starredConvs = new Set(stars?.conversationIds ?? []);

  async function toggleStar(target: { channelId?: string; conversationId?: string }) {
    const isChan = !!target.channelId;
    const id = (target.channelId ?? target.conversationId)!;
    const currently = isChan ? starredChannels.has(id) : starredConvs.has(id);
    void mutateStars(
      (cur) => {
        const chans = new Set(cur?.channelIds ?? []);
        const convs = new Set(cur?.conversationIds ?? []);
        const set = isChan ? chans : convs;
        if (currently) set.delete(id);
        else set.add(id);
        return { channelIds: [...chans], conversationIds: [...convs] };
      },
      { revalidate: false },
    );
    try {
      const res = await fetch("/api/stars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      if (!res.ok) throw new Error();
      void mutateStars();
    } catch {
      void mutateStars();
      toast.error("Could not update star");
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSwitcherOpen(true);
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

  const rowBase =
    "flex items-center gap-2 rounded-md py-1 pl-2 pr-7 text-[15px] transition";
  const rowTone = (active: boolean, hasUnread: boolean) =>
    active
      ? "bg-[var(--ws-active)] text-white"
      : hasUnread
        ? "font-bold text-white hover:bg-white/10"
        : "text-white/80 hover:bg-white/10";

  function channelRow(channel: SidebarChannel) {
    const href = `/w/${workspace.id}/c/${channel.id}`;
    const active = pathname === href;
    const counts = active ? undefined : unreadForChannel.get(channel.id);
    const hasUnread = (counts?.unread ?? 0) > 0;
    return (
      <li key={`c-${channel.id}`} className="group/row relative">
        <Link
          href={href}
          title={channel.archived ? "Archived channel" : undefined}
          className={cn(
            rowBase,
            rowTone(active, hasUnread),
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
          <UnreadBadge unread={counts?.unread ?? 0} mentions={counts?.mentions ?? 0} />
        </Link>
        <StarToggle
          starred={starredChannels.has(channel.id)}
          onToggle={() => toggleStar({ channelId: channel.id })}
        />
      </li>
    );
  }

  function convRow(conv: SidebarConversation) {
    const href = `/w/${workspace.id}/d/${conv.id}`;
    const active = pathname === href;
    const other = conv.users[0];
    const counts = active ? undefined : unreadForConversation.get(conv.id);
    const hasUnread = (counts?.unread ?? 0) > 0;
    return (
      <li key={`d-${conv.id}`} className="group/row relative">
        <Link href={href} className={cn(rowBase, rowTone(active, hasUnread))}>
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
            {conv.isSelf && <span className="ml-1 text-xs text-white/50">you</span>}
          </span>
          <UnreadBadge unread={counts?.unread ?? 0} mentions={counts?.mentions ?? 0} />
        </Link>
        <StarToggle
          starred={starredConvs.has(conv.id)}
          onToggle={() => toggleStar({ conversationId: conv.id })}
        />
      </li>
    );
  }

  const starredChannelList = liveChannels.filter((c) => starredChannels.has(c.id));
  const starredConvList = liveConversations.filter((c) => starredConvs.has(c.id));
  const hasStarred = starredChannelList.length + starredConvList.length > 0;
  const regularChannels = liveChannels.filter((c) => !starredChannels.has(c.id));
  const regularConvs = liveConversations.filter((c) => !starredConvs.has(c.id));

  return (
    <aside
      className="flex w-64 shrink-0 flex-col bg-[var(--ws-sidebar)] text-white/80"
      style={
        {
          "--ws-sidebar": theme.sidebar,
          "--ws-active": theme.active,
        } as CSSProperties
      }
    >
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
          {isAdmin && (
            <DropdownMenuItem onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-4" /> Invite people
            </DropdownMenuItem>
          )}
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
          onClick={() => setSwitcherOpen(true)}
          className="flex w-full items-center gap-2 rounded-md bg-white/10 px-2 py-1.5 text-sm text-white/70 transition hover:bg-white/15"
        >
          <Search className="size-3.5" />
          <span>Jump to…</span>
          <kbd className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium">
            ⌘K
          </kbd>
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs text-white/50 transition hover:bg-white/10 hover:text-white/70"
        >
          <Search className="size-3" />
          <span>Search messages</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {hasStarred && (
          <div className="mb-4">
            <SectionHeader
              label="Starred"
              collapsed={collapsed.Starred}
              onToggle={() => toggleSection("Starred")}
            />
            {!collapsed.Starred && (
              <ul className="mt-1 space-y-0.5">
                {starredChannelList.map(channelRow)}
                {starredConvList.map(convRow)}
              </ul>
            )}
          </div>
        )}

        {/* Channels */}
        <SectionHeader
          label="Channels"
          collapsed={collapsed.Channels}
          onToggle={() => toggleSection("Channels")}
          onAdd={() => setChannelDialog(true)}
          addLabel="Create channel"
        />
        {!collapsed.Channels && (
          <ul className="mb-4 mt-1 space-y-0.5">{regularChannels.map(channelRow)}</ul>
        )}

        {/* Direct messages */}
        <SectionHeader
          label="Direct messages"
          collapsed={collapsed["Direct messages"]}
          onToggle={() => toggleSection("Direct messages")}
          onAdd={() => setDmDialog(true)}
          addLabel="New message"
          icon={<MessageSquarePlus className="size-4" />}
        />
        {!collapsed["Direct messages"] && (
          <ul className="mt-1 space-y-0.5">
            {regularConvs.map(convRow)}
            {regularConvs.length === 0 && !hasStarred && (
              <li className="px-2 py-1 text-sm text-white/50">
                No direct messages yet.
              </li>
            )}
          </ul>
        )}
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
      <InviteDialog
        workspaceId={workspace.id}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
      <QuickSwitcher
        key={switcherOpen ? "open" : "closed"}
        workspaceId={workspace.id}
        channels={liveChannels}
        conversations={liveConversations}
        members={liveMembers}
        open={switcherOpen}
        onOpenChange={setSwitcherOpen}
      />
    </aside>
  );
}

function StarToggle({
  starred,
  onToggle,
}: {
  starred: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      title={starred ? "Remove from starred" : "Star"}
      className={cn(
        "absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-white/60 transition hover:text-white",
        starred ? "opacity-100" : "opacity-0 group-hover/row:opacity-100",
      )}
    >
      <Star className={cn("size-3.5", starred && "fill-yellow-300 text-yellow-300")} />
    </button>
  );
}

function SectionHeader({
  label,
  collapsed,
  onToggle,
  onAdd,
  addLabel,
  icon,
}: {
  label: string;
  collapsed?: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  addLabel?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="group flex items-center justify-between px-2 py-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-white/60 transition hover:text-white/80"
      >
        <ChevronRight className={cn("size-3 transition-transform", !collapsed && "rotate-90")} />
        {label}
      </button>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={addLabel}
          title={addLabel}
          className="flex size-5 items-center justify-center rounded text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          {icon ?? <Plus className="size-4" />}
        </button>
      )}
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
