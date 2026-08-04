import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { listChatSummaries } from "@/lib/wpp/chats";
import {
  assertNotBlocked,
  findOrCreateDirectChat,
  newInviteToken,
} from "@/lib/wpp/data";
import { writeSystemMessage } from "@/lib/wpp/messages";
import { broadcastChatUpdated } from "@/lib/wpp/realtime";
import { waCreateChatSchema } from "@/lib/wpp/validators";
import { MAX_GROUP_MEMBERS } from "@/lib/wpp/config";

/** The viewer's chat list. `?archived=1` returns the archived shelf instead. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const me = await requireWaUser();
    const archived = req.nextUrl.searchParams.get("archived") === "1";
    return NextResponse.json({ chats: await listChatSummaries(me, { archived }) });
  });
}

/**
 * Start a chat.
 *
 * `{ userId }` opens (or reuses) the 1:1 chat with that person — the unique
 * `directKey` makes "reuse" reliable even under a race. `{ type: "GROUP" }`
 * creates a group with the caller as its first admin.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();

    const parsed = waCreateChatSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "validate.invalidInput");
    }
    const input = parsed.data;

    // ── 1:1 ──────────────────────────────────────────────────────────────
    if (input.type !== "GROUP") {
      const otherId = input.userId ?? input.memberIds?.[0];
      if (!otherId) return apiError("validate.pickParticipants");
      const chat = await findOrCreateDirectChat(me.id, otherId);
      return NextResponse.json({ id: chat.id });
    }

    // ── Group ────────────────────────────────────────────────────────────
    const invited = [...new Set(input.memberIds ?? [])].filter((id) => id !== me.id);
    if (invited.length + 1 > MAX_GROUP_MEMBERS) {
      return apiError("validate.tooLong", 400);
    }

    const people = await prisma.waUser.findMany({
      where: { id: { in: invited }, deactivatedAt: null },
      select: { id: true, name: true },
    });
    if (people.length !== invited.length) {
      throw new ApiError("error.userNotFound", 404);
    }
    // You can't pull someone into a group across a block, in either direction.
    for (const person of people) await assertNotBlocked(me.id, person.id);

    const chat = await prisma.waChat.create({
      data: {
        type: "GROUP",
        subject: input.subject,
        description: input.description || null,
        createdById: me.id,
        inviteToken: newInviteToken(),
        members: {
          create: [
            { userId: me.id, role: "ADMIN" },
            ...people.map((p) => ({ userId: p.id, role: "MEMBER" as const })),
          ],
        },
      },
    });

    await writeSystemMessage(chat.id, "group.created", {
      actorId: me.id,
      actorName: me.name,
    });
    if (people.length > 0) {
      await writeSystemMessage(chat.id, "member.added", {
        actorId: me.id,
        actorName: me.name,
        targets: people.map((p) => ({ id: p.id, name: p.name })),
      });
    }

    await broadcastChatUpdated(chat.id);
    return NextResponse.json({ id: chat.id });
  });
}
