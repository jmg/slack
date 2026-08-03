import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { getChatDetail } from "@/lib/wpp/chats";
import { requireActiveChatMember } from "@/lib/wpp/data";
import { writeSystemMessage } from "@/lib/wpp/messages";
import { broadcastChatUpdated } from "@/lib/wpp/realtime";
import { waDisappearingSchema } from "@/lib/wpp/validators";

type Params = { params: Promise<{ chatId: string }> };

/**
 * Turn disappearing messages on (24 h / 7 d / 90 d) or off for a chat.
 *
 * ## The timer only ever applies to *new* messages
 * Nothing here touches the `expiresAt` of rows that already exist, and that is
 * deliberate: `expiresAt` is stamped once, at send time, from whatever the chat's
 * timer was then. Backfilling it would mean switching the timer on could delete
 * history that was sent when the chat had no timer at all — people would lose
 * messages they never agreed to make temporary, and the reverse (raising the
 * timer) would resurrect messages that were already meant to be gone. WhatsApp
 * draws the same line, which is why the column is on the message rather than
 * being evaluated against the chat's current setting on every read.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { chatId } = await params;
    const member = await requireActiveChatMember(me.id, chatId);

    // The timer is chat-wide state that everyone lives with, so it follows the
    // same rule as the rest of a group's info (see the group PATCH):
    // `onlyAdminsCanEditInfo` decides. A 1:1 has no admins and no asymmetry —
    // either participant may set it.
    if (
      member.chat.type === "GROUP" &&
      member.chat.onlyAdminsCanEditInfo &&
      member.role !== "ADMIN"
    ) {
      throw new ApiError("error.onlyAdmins", 403);
    }

    const parsed = waDisappearingSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "validate.invalidInput");
    }
    const { seconds } = parsed.data;

    // Re-picking the current value is not an event: it must not write a second
    // "turned on disappearing messages" line into the timeline.
    if (seconds === member.chat.disappearingSeconds) {
      return NextResponse.json(await getChatDetail(me, chatId));
    }

    await prisma.waChat.update({
      where: { id: chatId },
      data: { disappearingSeconds: seconds },
    });

    await writeSystemMessage(
      chatId,
      seconds === null ? "chat.disappearingOff" : "chat.disappearingOn",
      {
        actorId: me.id,
        actorName: me.name,
        // Stored as the raw seconds rather than a formatted duration: the
        // sentence is rendered per-viewer in their own language, so the row can
        // only hold the operand.
        ...(seconds === null ? {} : { value: String(seconds) }),
      },
    );

    await broadcastChatUpdated(chatId);
    return NextResponse.json(await getChatDetail(me, chatId));
  });
}
