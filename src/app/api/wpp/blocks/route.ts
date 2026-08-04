import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { blockSetsFor, directKeyFor, listWaContactItems } from "@/lib/wpp/data";
import { broadcastChatUpdated, broadcastContacts } from "@/lib/wpp/realtime";
import { waBlockSchema } from "@/lib/wpp/validators";

/**
 * Who the caller has blocked (Settings → Privacy → Blocked contacts).
 *
 * Only the blocks *they* made: whether someone else blocked them is never
 * disclosed, on this route or any other — a blocked sender's messages simply
 * stop arriving, exactly like WhatsApp.
 */
export async function GET() {
  return handle(async () => {
    const me = await requireWaUser();
    const { iBlocked } = await blockSetsFor(me.id);
    return NextResponse.json({
      contacts: await listWaContactItems(me, [...iBlocked]),
    });
  });
}

/**
 * Block or unblock an account.
 *
 * The block itself is the whole enforcement: `assertNotBlocked` (and through it
 * `requireCanSend`) reads these rows on every send, so nothing else has to
 * change here for messages to start bouncing in both directions.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();

    const parsed = waBlockSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "validate.invalidInput");
    }
    const { userId, blocked } = parsed.data;

    // Blocking yourself would make the "Message yourself" chat unusable.
    if (userId === me.id) throw new ApiError("error.forbidden", 400);

    const other = await prisma.waUser.findFirst({
      where: { id: userId, deactivatedAt: null },
      select: { id: true },
    });
    if (!other) throw new ApiError("error.userNotFound", 404);

    if (blocked) {
      await prisma.waBlock.upsert({
        where: { blockerId_blockedId: { blockerId: me.id, blockedId: userId } },
        create: { blockerId: me.id, blockedId: userId },
        update: {},
      });
    } else {
      await prisma.waBlock.deleteMany({
        where: { blockerId: me.id, blockedId: userId },
      });
    }

    await broadcastContacts([me.id, userId]);

    // The 1:1 chat's composer is now enabled or disabled for both sides
    // (`blockedReason` in getChatDetail), so it has to be re-fetched.
    const chat = await prisma.waChat.findUnique({
      where: { directKey: directKeyFor(me.id, userId) },
      select: { id: true },
    });
    if (chat) await broadcastChatUpdated(chat.id);

    return NextResponse.json({ ok: true, blocked });
  });
}
