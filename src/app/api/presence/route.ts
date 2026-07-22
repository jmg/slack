import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser } from "@/lib/api";
import { broadcastWorkspaceMembers } from "@/lib/realtime";
import { isOnline } from "@/lib/mentions";

/**
 * Client heartbeat: refresh this user's lastSeenAt so others see them online.
 * When the client tells us which workspace it's viewing, we also nudge that
 * workspace to re-fetch its member list, so a teammate coming online shows up
 * without waiting for the sidebar's slow fallback poll.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();

    // A routine heartbeat from an already-online user changes nothing others can
    // see, so only fan out on a genuine offline→online transition. Otherwise
    // every client's 60s ping would trigger a workspace-wide member refetch —
    // an O(N²) storm that defeats the point of moving off polling.
    const previous = await prisma.user.findUnique({
      where: { id: user.id },
      select: { lastSeenAt: true },
    });
    const cameOnline = !isOnline(previous?.lastSeenAt ?? null);

    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });

    const body = await req.json().catch(() => null);
    const workspaceId =
      body && typeof body.workspaceId === "string" ? body.workspaceId : null;
    if (workspaceId && cameOnline) {
      // Only broadcast to a workspace this user actually belongs to.
      const membership = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: user.id } },
        select: { id: true },
      });
      if (membership) broadcastWorkspaceMembers(workspaceId);
    }

    return NextResponse.json({ ok: true });
  });
}
