import { NextRequest, NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { requireWaUser } from "@/lib/wpp/api";
import { requireCanSend } from "@/lib/wpp/data";
import { broadcastTyping } from "@/lib/wpp/realtime";

type Params = { params: Promise<{ chatId: string }> };

/**
 * "…is typing".
 *
 * Nothing is persisted: a keystroke isn't worth a database row, and the signal
 * is meaningless a few seconds later. The client throttles to one call every
 * `TYPING_THROTTLE_MS` and recipients let the indicator lapse after
 * `TYPING_TTL_MS`, so no "stopped typing" message is needed either.
 *
 * The server-side limiter is a backstop against a client that ignores the
 * throttle, not the primary mechanism.
 */
export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { chatId } = await params;

    const limited = rateLimit(`wpp:typing:${me.id}:${chatId}`, 30, 60 * 1000);
    if (!limited.allowed) return NextResponse.json({ ok: true });

    // `requireCanSend`, not just "are you a member": a blocked contact must
    // produce no signal at all, and someone who can't post in an admins-only
    // group must not be able to make "X is typing…" appear for 255 people.
    await requireCanSend(me.id, chatId);
    await broadcastTyping(chatId, { id: me.id, name: me.name });

    return NextResponse.json({ ok: true });
  });
}
