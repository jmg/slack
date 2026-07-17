"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  Hash,
  Lock,
  LogOut,
  Plus,
  MessageSquarePlus,
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
import { cn } from "@/lib/utils";
import type {
  CurrentUser,
  SidebarChannel,
  SidebarConversation,
  SidebarMember,
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
          <DropdownMenuItem render={<Link href="/workspaces">Switch workspace</Link>} />
          <DropdownMenuItem onClick={signOut} variant="destructive">
            <LogOut className="size-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        {/* Channels */}
        <SectionHeader
          label="Channels"
          onAdd={() => setChannelDialog(true)}
          addLabel="Create channel"
        />
        <ul className="mb-4 mt-1 space-y-0.5">
          {channels.map((channel) => {
            const href = `/w/${workspace.id}/c/${channel.id}`;
            const active = pathname === href;
            return (
              <li key={channel.id}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1 text-[15px] transition",
                    active
                      ? "bg-[#1164a3] text-white"
                      : "text-white/80 hover:bg-white/10",
                  )}
                >
                  {channel.isPrivate ? (
                    <Lock className="size-3.5 shrink-0" />
                  ) : (
                    <Hash className="size-3.5 shrink-0" />
                  )}
                  <span className="truncate">{channel.name}</span>
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
          {conversations.map((conv) => {
            const href = `/w/${workspace.id}/d/${conv.id}`;
            const active = pathname === href;
            const other = conv.users[0];
            return (
              <li key={conv.id}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1 text-[15px] transition",
                    active
                      ? "bg-[#1164a3] text-white"
                      : "text-white/80 hover:bg-white/10",
                  )}
                >
                  {other && (
                    <UserAvatar
                      name={other.name}
                      image={other.image}
                      className="size-5 rounded"
                    />
                  )}
                  <span className="truncate">
                    {conv.name}
                    {conv.isSelf && (
                      <span className="ml-1 text-xs text-white/50">you</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
          {conversations.length === 0 && (
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
        members={members}
        open={dmDialog}
        onOpenChange={setDmDialog}
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
