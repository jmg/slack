import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { requireCanSend, requireMessageAccess } from "@/lib/wpp/data";
import { broadcastMessage } from "@/lib/wpp/realtime";
import { waReactionSchema } from "@/lib/wpp/validators";

type Params = { params: Promise<{ messageId: string }> };

/**
 * Set or clear your reaction.
 *
 * WhatsApp gives each person exactly one reaction per message, so this is an
 * upsert on (messageId, userId) rather than an insert — reacting again replaces
 * what was there. An empty emoji removes it.
 */
export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { messageId } = await params;
    const message = await requireMessageAccess(me.id, messageId);

    if (message.deletedAt) throw new ApiError("error.forbidden", 400);
    // Reacting is posting: the same block and admins-only rules apply.
    await requireCanSend(me.id, message.chatId);

    const parsed = waReactionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "validate.invalidInput");
    }
    const emoji = parsed.data.emoji.trim();

    if (!emoji) {
      await prisma.waReaction.deleteMany({ where: { messageId, userId: me.id } });
    } else {
      await prisma.waReaction.upsert({
        where: { messageId_userId: { messageId, userId: me.id } },
        create: { messageId, userId: me.id, emoji },
        update: { emoji },
      });
    }

    await broadcastMessage(message.chatId);
    return NextResponse.json({ ok: true });
  });
}
