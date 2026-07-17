import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { updateMessageSchema } from "@/lib/validators";
import { requireMessageAccess } from "@/lib/data";
import { messageInclude, serializeMessage } from "@/lib/messages";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { messageId } = await params;
    const message = await requireMessageAccess(user.id, messageId);
    if (message.userId !== user.id) {
      return apiError("You can only edit your own messages", 403);
    }
    if (message.deletedAt) {
      return apiError("This message has been deleted", 400);
    }

    const json = await req.json().catch(() => null);
    const parsed = updateMessageSchema.safeParse(json);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { body: parsed.data.body, editedAt: new Date() },
      include: messageInclude,
    });
    return NextResponse.json(serializeMessage(updated, user.id));
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { messageId } = await params;
    const message = await requireMessageAccess(user.id, messageId);
    if (message.userId !== user.id) {
      return apiError("You can only delete your own messages", 403);
    }

    // If this message is the root of a thread, other people's replies hang off
    // it via an ON DELETE CASCADE relation. Hard-deleting would destroy their
    // messages too, so soft-delete (tombstone) instead and keep the row.
    const replyCount = await prisma.message.count({
      where: { parentId: messageId },
    });
    if (replyCount > 0) {
      await prisma.$transaction([
        prisma.reaction.deleteMany({ where: { messageId } }),
        prisma.message.update({
          where: { id: messageId },
          data: { deletedAt: new Date(), body: "", editedAt: null },
        }),
      ]);
    } else {
      await prisma.message.delete({ where: { id: messageId } });
    }
    return NextResponse.json({ ok: true });
  });
}
