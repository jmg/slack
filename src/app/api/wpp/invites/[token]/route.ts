import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { writeSystemMessage } from "@/lib/wpp/messages";
import { broadcastChatUpdated } from "@/lib/wpp/realtime";
import { MAX_GROUP_MEMBERS } from "@/lib/wpp/config";

type Params = { params: Promise<{ token: string }> };

async function loadInvite(token: string) {
  const chat = await prisma.waChat.findUnique({
    where: { inviteToken: token },
    select: {
      id: true,
      type: true,
      subject: true,
      iconUrl: true,
      _count: { select: { members: { where: { leftAt: null } } } },
    },
  });
  if (!chat || chat.type !== "GROUP") {
    throw new ApiError("group.inviteInvalid", 404);
  }
  return chat;
}

/**
 * Preview a group invite. Deliberately readable without a session — the landing
 * page has to render for someone who is about to sign up, and it exposes only
 * what the person who shared the link already told them.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    const { token } = await params;
    const chat = await loadInvite(token);
    return NextResponse.json({
      name: chat.subject ?? "",
      avatarUrl: chat.iconUrl,
      memberCount: chat._count.members,
    });
  });
}

/** Join the group behind this link. */
export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { token } = await params;
    const chat = await loadInvite(token);

    const existing = await prisma.waChatMember.findUnique({
      where: { chatId_userId: { chatId: chat.id, userId: me.id } },
      select: { leftAt: true },
    });

    // Already in: joining again is a no-op that just opens the chat.
    if (existing && !existing.leftAt) {
      return NextResponse.json({ id: chat.id, joined: false });
    }
    if (chat._count.members >= MAX_GROUP_MEMBERS) {
      throw new ApiError("group.inviteInvalid", 409);
    }

    const now = new Date();
    if (existing) {
      await prisma.waChatMember.update({
        where: { chatId_userId: { chatId: chat.id, userId: me.id } },
        data: {
          leftAt: null,
          role: "MEMBER",
          joinedAt: now,
          lastReadAt: now,
          lastDeliveredAt: now,
        },
      });
    } else {
      await prisma.waChatMember.create({
        data: { chatId: chat.id, userId: me.id },
      });
    }

    await writeSystemMessage(chat.id, "member.joinedViaLink", {
      actorId: me.id,
      actorName: me.name,
    });
    await broadcastChatUpdated(chat.id);

    return NextResponse.json({ id: chat.id, joined: true });
  });
}
