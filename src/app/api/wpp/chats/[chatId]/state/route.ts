import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { requireChatMember } from "@/lib/wpp/data";
import { publishToWaUsers } from "@/lib/wpp/events";
import { waChatStateSchema } from "@/lib/wpp/validators";

type Params = { params: Promise<{ chatId: string }> };

/**
 * Per-user chat state: pin, archive, mute, mark-unread, clear, draft.
 *
 * Every field here lives on the *membership* row, not the chat — pinning a chat
 * pins it for you alone. That's why nothing in this handler broadcasts to the
 * other participants: only the caller's own list changed.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { chatId } = await params;
    await requireChatMember(me.id, chatId);

    const parsed = waChatStateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "validate.invalidInput");
    }
    const input = parsed.data;

    const now = new Date();
    const data: Record<string, unknown> = {};

    if (input.pinned !== undefined) data.pinnedAt = input.pinned ? now : null;
    if (input.archived !== undefined) data.archivedAt = input.archived ? now : null;
    if (input.mutedUntil !== undefined) {
      data.mutedUntil = input.mutedUntil ? new Date(input.mutedUntil) : null;
    }
    if (input.draft !== undefined) data.draft = input.draft || null;

    // "Clear messages" hides history for the caller without touching a row —
    // the other side keeps their copy of the conversation intact.
    if (input.clear) {
      data.clearedAt = now;
      data.lastReadAt = now;
    }

    // `clear` wipes the history and `unread` asks for one unread message in it;
    // together they contradict, and `clearedAt` would silently win because every
    // unread calculation takes max(clearedAt, lastReadAt). Clearing wins
    // explicitly instead of by accident.
    if (input.unread !== undefined && !input.clear) {
      if (input.unread) {
        // Rewind the cursor to just before the newest incoming message, so the
        // chat shows exactly one unread again — WhatsApp's "mark as unread".
        const latest = await prisma.waMessage.findFirst({
          where: {
            chatId,
            senderId: { not: me.id },
            kind: { not: "SYSTEM" },
            deletedAt: null,
            hides: { none: { userId: me.id } },
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });
        if (latest) data.lastReadAt = new Date(latest.createdAt.getTime() - 1);
      } else {
        data.lastReadAt = now;
        data.lastDeliveredAt = now;
      }
    }

    if (Object.keys(data).length > 0) {
      await prisma.waChatMember.update({
        where: { chatId_userId: { chatId, userId: me.id } },
        data,
      });
    }

    // Only the caller's own other tabs need to know.
    publishToWaUsers([me.id], { kind: "chats" });

    return NextResponse.json({ ok: true });
  });
}
