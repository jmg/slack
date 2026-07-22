import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { reactionSchema } from "@/lib/validators";
import { requireChannelAccess, requireConversationMember } from "@/lib/data";
import { messageInclude, serializeMessage } from "@/lib/messages";
import { broadcastMessage } from "@/lib/realtime";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { messageId } = await params;

    const json = await req.json().catch(() => null);
    const parsed = reactionSchema.safeParse(json);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { emoji } = parsed.data;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        channelId: true,
        conversationId: true,
        parentId: true,
      },
    });
    if (!message) return apiError("Message not found", 404);

    // Authorize against the channel / conversation the message lives in.
    if (message.channelId) {
      await requireChannelAccess(user.id, message.channelId);
    } else if (message.conversationId) {
      await requireConversationMember(user.id, message.conversationId);
    } else {
      return apiError("Message not found", 404);
    }

    const existing = await prisma.reaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId: user.id, emoji } },
    });
    if (existing) {
      await prisma.reaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.reaction.create({
        data: { messageId, userId: user.id, emoji },
      });
    }

    const updated = await prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      include: messageInclude,
    });
    await broadcastMessage(message);
    return NextResponse.json(serializeMessage(updated, user.id));
  });
}
