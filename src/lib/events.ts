import "server-only";
import type { WorkspaceEvent } from "@/lib/realtime-types";

/**
 * In-process publish/subscribe bus that fans workspace events out to every
 * connected SSE stream (see `app/api/workspaces/[workspaceId]/events`).
 *
 * "In-process" is the load-bearing caveat: this only reaches subscribers on the
 * same Node process. The app runs a single web process (see the Procfile), so
 * that's every subscriber today. If it's ever scaled horizontally the bus must
 * move to a shared transport — Postgres `LISTEN/NOTIFY` (the `pg` pool is
 * already a dependency) or Redis.
 *
 * Held on `globalThis` so it survives dev HMR module reloads, mirroring the lazy
 * Prisma singleton.
 */

type Subscriber = {
  userId: string;
  send: (event: WorkspaceEvent) => void;
};

type Bus = Map<string, Set<Subscriber>>; // workspaceId → subscribers

const globalForBus = globalThis as unknown as { __wsEventBus?: Bus };
const bus: Bus = (globalForBus.__wsEventBus ??= new Map());

/** Register a stream. Returns an unsubscribe to call when it closes. */
export function subscribe(workspaceId: string, subscriber: Subscriber): () => void {
  let set = bus.get(workspaceId);
  if (!set) {
    set = new Set();
    bus.set(workspaceId, set);
  }
  set.add(subscriber);
  return () => {
    const current = bus.get(workspaceId);
    if (!current) return;
    current.delete(subscriber);
    if (current.size === 0) bus.delete(workspaceId);
  };
}

/** Deliver to every connected member of the workspace (public channels, etc.). */
export function publishToWorkspace(workspaceId: string, event: WorkspaceEvent) {
  const set = bus.get(workspaceId);
  if (!set) return;
  for (const sub of set) sub.send(event);
}

/** Deliver only to the given users — private channels and DMs. */
export function publishToUsers(
  workspaceId: string,
  userIds: Iterable<string>,
  event: WorkspaceEvent,
) {
  const set = bus.get(workspaceId);
  if (!set) return;
  const allowed = new Set(userIds);
  for (const sub of set) {
    if (allowed.has(sub.userId)) sub.send(event);
  }
}
