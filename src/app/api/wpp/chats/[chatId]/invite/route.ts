import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { newInviteToken, requireChatAdmin } from "@/lib/wpp/data";
import { broadcastChatUpdated } from "@/lib/wpp/realtime";
import { wpp } from "@/lib/wpp/config";

type Params = { params: Promise<{ chatId: string }> };

/**
 * Rotate the group's invite link.
 *
 * Admin-only, because the link *is* the capability: anyone holding the old one
 * can join until it's replaced, which is the entire point of being able to
 * reset it.
 */
export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { chatId } = await params;
    const admin = await requireChatAdmin(me.id, chatId);
    if (admin.chat.type !== "GROUP") throw new ApiError("error.forbidden", 403);

    const inviteToken = newInviteToken();
    await prisma.waChat.update({ where: { id: chatId }, data: { inviteToken } });
    await broadcastChatUpdated(chatId);

    return NextResponse.json({ inviteUrl: wpp(`/invite/${inviteToken}`) });
  });
}
