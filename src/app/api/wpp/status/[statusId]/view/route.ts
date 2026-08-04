import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { blockStateBetween, isContactOf } from "@/lib/wpp/data";
import { broadcastStatus } from "@/lib/wpp/realtime";

type Params = { params: Promise<{ statusId: string }> };

/**
 * Mark a status as seen.
 *
 * The view is a receipt the author gets to read, so it may only be recorded by
 * someone who was actually allowed to watch: the audience rule from
 * `/api/wpp/status` is re-checked here rather than trusted from the client —
 * otherwise anyone with a status id could plant themselves in a stranger's
 * viewer list.
 */
export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { statusId } = await params;

    const status = await prisma.waStatus.findUnique({
      where: { id: statusId },
      select: { id: true, userId: true, expiresAt: true },
    });
    // An expired status is gone as far as the API is concerned, sweep or no
    // sweep — including for the purpose of viewing it.
    if (!status || status.expiresAt <= new Date()) {
      throw new ApiError("error.notFound", 404);
    }

    // Your own updates never generate a view: "seen by" is a list of other
    // people, and looking at your own status would put you in it.
    if (status.userId === me.id) return NextResponse.json({ ok: true });

    const blocks = await blockStateBetween(me.id, status.userId);
    if (blocks.iBlockedThem || blocks.theyBlockedMe) {
      throw new ApiError("error.notFound", 404);
    }
    // The author shared with their address book — the caller has to be in it.
    if (!(await isContactOf(status.userId, me.id))) {
      throw new ApiError("error.notFound", 404);
    }

    // First view wins: `viewedAt` is when they saw it, not when they last did.
    await prisma.waStatusView.upsert({
      where: { statusId_viewerId: { statusId: status.id, viewerId: me.id } },
      create: { statusId: status.id, viewerId: me.id },
      update: {},
    });

    // Only the author's own feed changed — nobody else can see this receipt.
    await broadcastStatus([status.userId]);

    return NextResponse.json({ ok: true });
  });
}
