import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { requireChatAdmin } from "@/lib/wpp/data";
import { writeSystemMessage } from "@/lib/wpp/messages";
import { broadcastChatUpdated } from "@/lib/wpp/realtime";
import { waMemberRoleSchema } from "@/lib/wpp/validators";

type Params = { params: Promise<{ chatId: string; userId: string }> };

async function loadTarget(chatId: string, userId: string) {
  const target = await prisma.waChatMember.findUnique({
    where: { chatId_userId: { chatId, userId } },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!target || target.leftAt) throw new ApiError("error.userNotFound", 404);
  return target;
}

/** Promote to admin or dismiss as admin. */
export async function PATCH(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { chatId, userId } = await params;
    const admin = await requireChatAdmin(me.id, chatId);
    if (admin.chat.type !== "GROUP") throw new ApiError("error.forbidden", 403);

    const parsed = waMemberRoleSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "validate.invalidInput");
    }

    const target = await loadTarget(chatId, userId);
    if (target.role === parsed.data.role) {
      return NextResponse.json({ ok: true });
    }

    // A group must never end up with no admin — there'd be no way back.
    if (parsed.data.role === "MEMBER") {
      const admins = await prisma.waChatMember.count({
        where: { chatId, role: "ADMIN", leftAt: null },
      });
      if (admins <= 1) throw new ApiError("error.onlyAdmins", 400);
    }

    await prisma.waChatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { role: parsed.data.role },
    });

    await writeSystemMessage(
      chatId,
      parsed.data.role === "ADMIN" ? "admin.granted" : "admin.revoked",
      {
        actorId: me.id,
        actorName: me.name,
        targets: [{ id: target.user.id, name: target.user.name }],
      },
    );
    await broadcastChatUpdated(chatId);

    return NextResponse.json({ ok: true });
  });
}

/**
 * Remove a participant.
 *
 * `leftAt` rather than a delete: their messages stay in the group (removing
 * someone shouldn't rewrite the conversation) and the row is what an admin
 * later re-adding them revives.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { chatId, userId } = await params;
    const admin = await requireChatAdmin(me.id, chatId);
    if (admin.chat.type !== "GROUP") throw new ApiError("error.forbidden", 403);
    if (userId === me.id) {
      // Removing yourself is "exit group", which has its own endpoint and its
      // own system message.
      throw new ApiError("error.forbidden", 400);
    }

    const target = await loadTarget(chatId, userId);

    await prisma.waChatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { leftAt: new Date() },
    });

    await writeSystemMessage(chatId, "member.removed", {
      actorId: me.id,
      actorName: me.name,
      targets: [{ id: target.user.id, name: target.user.name }],
    });
    // The removed person is no longer a member, so include them explicitly or
    // they'd never learn the group closed behind them.
    await broadcastChatUpdated(chatId, [userId]);

    return NextResponse.json({ ok: true });
  });
}
