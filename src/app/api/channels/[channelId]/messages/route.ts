import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { createMessageSchema } from "@/lib/validators";
import { requireChannelAccess } from "@/lib/data";
import { listChannelMessages, messageInclude, serializeMessage } from "@/lib/messages";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { channelId } = await params;
    await requireChannelAccess(user.id, channelId);
    const messages = await listChannelMessages(channelId, user.id);
    return NextResponse.json(messages);
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { channelId } = await params;
    await requireChannelAccess(user.id, channelId);

    const json = await req.json().catch(() => null);
    const parsed = createMessageSchema.safeParse(json);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const message = await prisma.message.create({
      data: { body: parsed.data.body, channelId, userId: user.id },
      include: messageInclude,
    });
    return NextResponse.json(serializeMessage(message, user.id));
  });
}
