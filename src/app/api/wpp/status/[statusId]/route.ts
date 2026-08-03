import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { contactIdsOf } from "@/lib/wpp/data";
import { deleteWaAttachment } from "@/lib/wpp/uploads";
import { broadcastStatus } from "@/lib/wpp/realtime";

type Params = { params: Promise<{ statusId: string }> };

/**
 * Delete one of your own status updates.
 *
 * Scoped by `userId` in the lookup rather than checked afterwards, so someone
 * else's status is indistinguishable from one that never existed. The views go
 * with it by cascade, and the media is dropped outright — a status is the one
 * place media is single-use, so there is nothing else pointing at the object.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { statusId } = await params;

    const status = await prisma.waStatus.findFirst({
      where: { id: statusId, userId: me.id },
      select: { id: true, attachmentId: true },
    });
    if (!status) throw new ApiError("error.notFound", 404);

    await prisma.waStatus.delete({ where: { id: status.id } });
    await deleteWaAttachment(status.attachmentId);

    // Same audience the post went to, so it disappears from their feed too.
    const audience = await contactIdsOf(me.id);
    await broadcastStatus([me.id, ...audience]);

    return NextResponse.json({ ok: true });
  });
}
