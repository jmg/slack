"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type RailWorkspace = { id: string; name: string };

export function WorkspaceRail({
  workspaces,
  activeId,
}: {
  workspaces: RailWorkspace[];
  activeId: string;
}) {
  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-2 bg-[#2c0d2d] py-3">
      {workspaces.map((ws) => (
        <Tooltip key={ws.id}>
          <TooltipTrigger
            render={
              <Link
                href={`/w/${ws.id}`}
                className={cn(
                  "flex size-11 items-center justify-center rounded-lg text-lg font-bold transition",
                  ws.id === activeId
                    ? "bg-white text-[#2c0d2d]"
                    : "bg-white/10 text-white hover:bg-white/20",
                )}
              >
                {ws.name.charAt(0).toUpperCase()}
              </Link>
            }
          />
          <TooltipContent side="right">{ws.name}</TooltipContent>
        </Tooltip>
      ))}

      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              href="/workspaces"
              className="flex size-11 items-center justify-center rounded-lg bg-white/10 text-white transition hover:bg-white/20"
            >
              <Plus className="size-5" />
            </Link>
          }
        />
        <TooltipContent side="right">Add or switch workspace</TooltipContent>
      </Tooltip>
    </nav>
  );
}
