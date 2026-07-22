import { NextRequest } from "next/server";
import { requireUser } from "@/lib/api";
import { requireWorkspaceMember } from "@/lib/data";
import { subscribe } from "@/lib/events";
import type { WorkspaceEvent } from "@/lib/realtime-types";

// A long-lived streaming connection: never cache, always run on the Node runtime.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events stream for one workspace. The browser opens a single
 * `EventSource` here (see `useWorkspaceEvents`); we push change signals as they
 * happen and revalidate the affected data client-side. Cookies ride along on the
 * same-origin request, so the connection is authenticated like any other route.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  let userId: string;
  try {
    const user = await requireUser();
    userId = user.id;
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const { workspaceId } = await params;
  try {
    await requireWorkspaceMember(userId, workspaceId);
  } catch {
    return new Response("Not found", { status: 404 });
  }

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

      unsubscribe = subscribe(workspaceId, {
        userId,
        send: (event: WorkspaceEvent) =>
          write(`data: ${JSON.stringify(event)}\n\n`),
      });

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
