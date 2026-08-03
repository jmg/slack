import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { requireCanSend } from "@/lib/wpp/data";
import { broadcastMessage } from "@/lib/wpp/realtime";
import { waPollVoteSchema } from "@/lib/wpp/validators";

type Params = { params: Promise<{ pollId: string }> };

/**
 * Cast, change or clear your vote.
 *
 * The body is the voter's *whole* selection, not a delta: a multi-answer poll
 * would otherwise need one request per box and the tally would be visibly wrong
 * between them. Replacing also makes the single-answer case fall out for free —
 * picking a second option is the same call as picking the first.
 *
 * Delete-then-insert runs in one transaction so a vote change is never
 * observable as a moment with no vote at all; anyone reading mid-swap would see
 * a total that dips and recovers.
 */
export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { pollId } = await params;

    const poll = await prisma.waPoll.findUnique({
      where: { id: pollId },
      select: {
        allowMultiple: true,
        closedAt: true,
        message: { select: { chatId: true, deletedAt: true } },
        options: { select: { id: true } },
      },
    });
    if (!poll) throw new ApiError("error.notFound", 404);

    // Voting is posting: a blocked contact or an admins-only group must not be
    // able to write into the chat through a poll either.
    await requireCanSend(me.id, poll.message.chatId);

    if (poll.message.deletedAt) throw new ApiError("error.forbidden", 400);
    if (poll.closedAt) throw new ApiError("poll.closed", 400);

    const parsed = waPollVoteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "validate.invalidInput");
    }
    // The unique on (optionId, userId) would reject a repeated id as a conflict;
    // deduping first turns a harmless client quirk into a no-op instead.
    const optionIds = [...new Set(parsed.data.optionIds)];

    const ownIds = poll.options.map((option) => option.id);
    const own = new Set(ownIds);
    if (optionIds.some((id) => !own.has(id))) {
      throw new ApiError("error.notFound", 404);
    }
    if (!poll.allowMultiple && optionIds.length > 1) {
      return apiError("validate.invalidInput");
    }

    await prisma.$transaction(async (tx) => {
      // Scoped to this poll's options: a voter's picks in other polls are none
      // of this request's business.
      await tx.waPollVote.deleteMany({
        where: { userId: me.id, optionId: { in: ownIds } },
      });
      if (optionIds.length > 0) {
        await tx.waPollVote.createMany({
          data: optionIds.map((optionId) => ({ optionId, userId: me.id })),
        });
      }
    });

    await broadcastMessage(poll.message.chatId);
    return NextResponse.json({ ok: true });
  });
}
