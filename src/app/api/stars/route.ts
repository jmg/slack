import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { requireChannelAccess, requireConversationMember } from "@/lib/data";

const schema = z
  .object({
    channelId: z.string().optional(),
    conversationId: z.string().optional(),
  })
  .refine((d) => !!d.channelId !== !!d.conversationId, "Provide exactly one target");

/** Toggle a star (favourite) on a channel or DM for the current user. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("Invalid input");
    const { channelId, conversationId } = parsed.data;

    // You can only star something you can access.
    if (channelId) await requireChannelAccess(user.id, channelId);
    else await requireConversationMember(user.id, conversationId!);

    const where = channelId
      ? { userId_channelId: { userId: user.id, channelId } }
      : { userId_conversationId: { userId: user.id, conversationId: conversationId! } };

    const existing = await prisma.star.findUnique({ where });
    if (existing) {
      await prisma.star.delete({ where: { id: existing.id } });
      return NextResponse.json({ starred: false });
    }
    await prisma.star.create({
      data: {
        userId: user.id,
        channelId: channelId ?? null,
        conversationId: conversationId ?? null,
      },
    });
    return NextResponse.json({ starred: true });
  });
}
