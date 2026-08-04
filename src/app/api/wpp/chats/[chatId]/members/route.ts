import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { assertNotBlocked, requireChatAdmin } from "@/lib/wpp/data";
import { writeSystemMessage } from "@/lib/wpp/messages";
import { broadcastChatUpdated } from "@/lib/wpp/realtime";
import { waAddMembersSchema } from "@/lib/wpp/validators";
import { MAX_GROUP_MEMBERS } from "@/lib/wpp/config";

type Params = { params: Promise<{ chatId: string }> };

/** Add participants to a group. Admin-only, like WhatsApp. */
export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { chatId } = await params;
    const admin = await requireChatAdmin(me.id, chatId);

    if (admin.chat.type !== "GROUP") throw new ApiError("error.forbidden", 403);

    const parsed = waAddMembersSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "validate.invalidInput");
    }

    const existing = await prisma.waChatMember.findMany({
      where: { chatId },
      select: { userId: true, leftAt: true },
    });
    const activeIds = new Set(
      existing.filter((m) => !m.leftAt).map((m) => m.userId),
    );
    const rejoinIds = new Set(
      existing.filter((m) => m.leftAt).map((m) => m.userId),
    );

    const wanted = [...new Set(parsed.data.userIds)].filter(
      (id) => !activeIds.has(id),
    );
    if (wanted.length === 0) {
      return NextResponse.json({ ok: true, added: 0 });
    }
    if (activeIds.size + wanted.length > MAX_GROUP_MEMBERS) {
      return apiError("validate.tooLong", 400);
    }

    const people = await prisma.waUser.findMany({
      where: { id: { in: wanted }, deactivatedAt: null },
      select: { id: true, name: true },
    });
    if (people.length !== wanted.length) {
      throw new ApiError("error.userNotFound", 404);
    }
    for (const person of people) await assertNotBlocked(me.id, person.id);

    const now = new Date();
    await prisma.$transaction([
      // Someone who left before gets their old row revived, so their history in
      // the group stays attached to one membership rather than forking.
      ...people
        .filter((p) => rejoinIds.has(p.id))
        .map((p) =>
          prisma.waChatMember.update({
            where: { chatId_userId: { chatId, userId: p.id } },
            data: {
              leftAt: null,
              role: "MEMBER",
              joinedAt: now,
              lastReadAt: now,
              lastDeliveredAt: now,
            },
          }),
        ),
      prisma.waChatMember.createMany({
        data: people
          .filter((p) => !rejoinIds.has(p.id))
          .map((p) => ({ chatId, userId: p.id })),
        skipDuplicates: true,
      }),
    ]);

    await writeSystemMessage(chatId, "member.added", {
      actorId: me.id,
      actorName: me.name,
      targets: people.map((p) => ({ id: p.id, name: p.name })),
    });
    await broadcastChatUpdated(chatId);

    return NextResponse.json({ ok: true, added: people.length });
  });
}
