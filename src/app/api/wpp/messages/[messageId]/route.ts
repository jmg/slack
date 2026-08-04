import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { requireMessageAccess } from "@/lib/wpp/data";
import { broadcastMessage } from "@/lib/wpp/realtime";
import { waDeleteMessageSchema, waEditMessageSchema } from "@/lib/wpp/validators";
import { DELETE_FOR_EVERYONE_WINDOW_MS, EDIT_WINDOW_MS } from "@/lib/wpp/config";

type Params = { params: Promise<{ messageId: string }> };

/**
 * Edit a message.
 *
 * Only your own, only text, and only inside the 15-minute window WhatsApp
 * allows. `editedAt` is what makes the "edited" marker appear in the bubble.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { messageId } = await params;
    const message = await requireMessageAccess(me.id, messageId);

    if (message.senderId !== me.id || message.deletedAt) {
      throw new ApiError("error.forbidden", 403);
    }
    if (message.kind !== "TEXT") throw new ApiError("error.forbidden", 400);
    if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw new ApiError("message.editWindowExpired", 400);
    }

    const parsed = waEditMessageSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "validate.invalidInput");
    }

    await prisma.waMessage.update({
      where: { id: messageId },
      data: { body: parsed.data.body, editedAt: new Date() },
    });
    await broadcastMessage(message.chatId);

    return NextResponse.json({ ok: true });
  });
}

/**
 * Delete a message, in WhatsApp's two flavours.
 *
 * - `me`: a per-user hide. The row survives untouched for everyone else.
 * - `everyone`: tombstone the row. Body, attachments and reactions stop being
 *   serialized, but the row stays so replies quoting it still resolve — and so
 *   the recipients see "This message was deleted" rather than a silent gap.
 *
 * "Delete for everyone" is yours only, and only within WhatsApp's 2 day 12 hour
 * window.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { messageId } = await params;
    const message = await requireMessageAccess(me.id, messageId);

    const parsed = waDeleteMessageSchema.safeParse(
      await req.json().catch(() => ({ scope: "me" })),
    );
    const scope = parsed.success ? parsed.data.scope : "me";

    if (scope === "everyone") {
      if (message.senderId !== me.id) throw new ApiError("error.forbidden", 403);
      if (
        Date.now() - message.createdAt.getTime() >
        DELETE_FOR_EVERYONE_WINDOW_MS
      ) {
        throw new ApiError("message.deleteWindowExpired", 400);
      }
      if (!message.deletedAt) {
        await prisma.waMessage.update({
          where: { id: messageId },
          data: { deletedAt: new Date() },
        });
        // Nothing may survive the tombstone that could still be rendered.
        await prisma.waReaction.deleteMany({ where: { messageId } });
      }
      await broadcastMessage(message.chatId);
      return NextResponse.json({ ok: true });
    }

    await prisma.waMessageHide.upsert({
      where: { messageId_userId: { messageId, userId: me.id } },
      create: { messageId, userId: me.id },
      update: {},
    });

    return NextResponse.json({ ok: true });
  });
}
