import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { ensureGroupHasAdmin, requireActiveChatMember } from "@/lib/wpp/data";
import { writeSystemMessage } from "@/lib/wpp/messages";
import { broadcastChatUpdated } from "@/lib/wpp/realtime";

type Params = { params: Promise<{ chatId: string }> };

/**
 * Exit a group.
 *
 * The chat stays in your list, read-only, until you delete it — that's what
 * WhatsApp does, and it's why this sets `leftAt` instead of dropping the row.
 */
export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { chatId } = await params;
    const member = await requireActiveChatMember(me.id, chatId);
    if (member.chat.type !== "GROUP") throw new ApiError("error.forbidden", 403);

    await prisma.waChatMember.update({
      where: { chatId_userId: { chatId, userId: me.id } },
      data: { leftAt: new Date(), role: "MEMBER" },
    });

    // Don't strand the group without an admin. Shared with the other two exits
    // (delete chat, delete account) so all three behave identically.
    await ensureGroupHasAdmin(chatId);

    await writeSystemMessage(chatId, "member.left", {
      actorId: me.id,
      actorName: me.name,
    });
    await broadcastChatUpdated(chatId, [me.id]);

    return NextResponse.json({ ok: true });
  });
}
