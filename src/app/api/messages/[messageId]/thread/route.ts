import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { createMessageSchema } from "@/lib/validators";
import { requireMessageAccess } from "@/lib/data";
import {
  listThreadReplies,
  messageInclude,
  serializeMessage,
} from "@/lib/messages";
import { claimAttachments } from "@/lib/uploads";
import { broadcastMessage } from "@/lib/realtime";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { messageId } = await params;
    await requireMessageAccess(user.id, messageId);

    const parent = await prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      include: messageInclude,
    });
    const replies = await listThreadReplies(messageId, user.id);
    return NextResponse.json({
      parent: serializeMessage(parent, user.id),
      replies,
    });
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { messageId } = await params;
    const parent = await requireMessageAccess(user.id, messageId);
    // Replies always attach to the top-level message, never to another reply.
    if (parent.parentId) {
      return apiError("Cannot reply to a reply", 400);
    }

    const json = await req.json().catch(() => null);
    const parsed = createMessageSchema.safeParse(json);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const reply = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          body: parsed.data.body,
          userId: user.id,
          parentId: parent.id,
          channelId: parent.channelId,
          conversationId: parent.conversationId,
        },
      });
      await claimAttachments(tx, {
        attachmentIds: parsed.data.attachmentIds,
        userId: user.id,
        messageId: created.id,
      });
      return tx.message.findUniqueOrThrow({
        where: { id: created.id },
        include: messageInclude,
      });
    });
    await broadcastMessage({
      id: reply.id,
      channelId: parent.channelId,
      conversationId: parent.conversationId,
      parentId: parent.id,
    });
    return NextResponse.json(serializeMessage(reply, user.id));
  });
}
