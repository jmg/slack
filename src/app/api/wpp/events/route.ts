import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireWaUser } from "@/lib/wpp/api";
import { advanceDeliveryCursors } from "@/lib/wpp/data";
import { subscribeWa } from "@/lib/wpp/events";
import { broadcastPresence, broadcastReceipts } from "@/lib/wpp/realtime";
import type { WppEvent } from "@/lib/wpp/realtime-types";

// A long-lived streaming connection: never cache, always run on the Node runtime.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The connecting client is proof of delivery.
 *
 * `markDeliveredToConnected` does this for *other* people when a message is
 * written; here we do the inverse for the account that just opened a stream —
 * everything already waiting for them is delivered the moment their client is
 * back. That's what turns a sender's single tick into two without waiting for
 * the recipient to open the chat.
 *
 * All of it is best-effort: the stream is worth opening even if the bookkeeping
 * around it fails.
 */
async function noteConnected(userId: string): Promise<void> {
  try {
    const chatIds = await advanceDeliveryCursors(userId);
    for (const chatId of chatIds) await broadcastReceipts(chatId);

    await prisma.waUser.update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    });
    await broadcastPresence(userId);
  } catch (err) {
    console.error("wpp: could not record stream connect", err);
  }
}

/**
 * Server-Sent Events stream for one WhatsApp account.
 *
 * Unlike the Slack half there is no workspace to scope the stream to, so the
 * subscription is keyed by user id and the *publisher* resolves who should hear
 * each event (see `lib/wpp/events.ts`). One `EventSource` per signed-in account
 * therefore covers every chat, contact and status change at once.
 *
 * Cookies ride along on the same-origin request, so the connection is
 * authenticated exactly like any other route.
 */
export async function GET(req: NextRequest) {
  let userId: string;
  try {
    const me = await requireWaUser();
    userId = me.id;
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  await noteConnected(userId);

  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const write = (chunk: string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          open = false; // consumer went away between the abort and now
        }
      };

      // An initial comment flushes headers so the client's `onopen` fires.
      write(": connected\n\n");

      unsubscribe = subscribeWa(userId, (event: WppEvent) =>
        write(`data: ${JSON.stringify(event)}\n\n`),
      );

      // Comment-only heartbeat keeps proxies from timing the stream out.
      heartbeat = setInterval(() => write(": ping\n\n"), 25_000);

      const close = () => {
        if (!open) return;
        open = false;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", close, { once: true });
      // The client can already be gone by the time start() runs (it fires only
      // after the awaited auth round-trips). A listener added to an
      // already-aborted signal never fires, and Next skips cancel() for an
      // aborted response — so without this, the heartbeat + subscription leak.
      if (req.signal.aborted) close();
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (nginx/traefik) so events aren't held back.
      "X-Accel-Buffering": "no",
    },
  });
}
