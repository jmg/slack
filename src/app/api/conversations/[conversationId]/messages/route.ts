import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { createMessageSchema } from "@/lib/validators";
import { requireConversationMember } from "@/lib/data";
import {
  listConversationMessages,
  messageInclude,
  serializeMessage,
} from "@/lib/messages";
import { claimAttachments } from "@/lib/uploads";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { conversationId } = await params;
    await requireConversationMember(user.id, conversationId);
    const messages = await listConversationMessages(conversationId, user.id);
    return NextResponse.json(messages);
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { conversationId } = await params;
    await requireConversationMember(user.id, conversationId);

    const json = await req.json().catch(() => null);
    const parsed = createMessageSchema.safeParse(json);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: { body: parsed.data.body, conversationId, userId: user.id },
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
    return NextResponse.json(serializeMessage(message, user.id));
  });
}
