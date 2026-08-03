import "server-only";
import type { WppEvent } from "@/lib/wpp/realtime-types";

/**
 * In-process publish/subscribe bus for the WhatsApp clone.
 *
 * Keyed by **user id**, not by chat: a WhatsApp account has no workspace to
 * scope a stream to, and one person's chats change constantly. So each browser
 * opens exactly one stream for the signed-in account and the publisher resolves
 * the audience (a chat's participants, a contact list) at send time.
 *
 * "In-process" is the load-bearing caveat, same as `src/lib/events.ts`: this
 * only reaches subscribers on this Node process, which is every subscriber
 * today because the Procfile runs a single web process. Scaling out means
 * moving both buses to a shared transport — Postgres `LISTEN/NOTIFY` (the `pg`
 * pool is already a dependency) or Redis.
 *
 * Held on `globalThis` so it survives dev HMR reloads, mirroring the lazy
 * Prisma singleton.
 */

type Subscriber = (event: WppEvent) => void;

type Bus = Map<string, Set<Subscriber>>; // userId → open streams

const globalForBus = globalThis as unknown as { __wppEventBus?: Bus };
const bus: Bus = (globalForBus.__wppEventBus ??= new Map());

/** Register a stream for one user. Returns the unsubscribe to call on close. */
export function subscribeWa(userId: string, send: Subscriber): () => void {
  let set = bus.get(userId);
  if (!set) {
    set = new Set();
    bus.set(userId, set);
  }
  set.add(send);
  return () => {
    const current = bus.get(userId);
    if (!current) return;
    current.delete(send);
    if (current.size === 0) bus.delete(userId);
  };
}

/** Deliver an event to every open stream of the given users. */
export function publishToWaUsers(
  userIds: Iterable<string>,
  event: WppEvent,
): void {
  const seen = new Set<string>();
  for (const userId of userIds) {
    if (seen.has(userId)) continue;
    seen.add(userId);
    const set = bus.get(userId);
    if (!set) continue;
    for (const send of set) send(event);
  }
}

/**
 * Is this account connected right now?
 *
 * Used to advance the delivery cursor the moment a message is written: an open
 * stream is the strongest "their client has it" signal we have, which is what
 * turns one tick into two without waiting for the recipient to poll.
 */
export function isWaConnected(userId: string): boolean {
  return (bus.get(userId)?.size ?? 0) > 0;
}

/** Everyone with an open stream, out of the given candidates. */
export function connectedAmong(userIds: Iterable<string>): string[] {
  const out: string[] = [];
  for (const userId of userIds) {
    if (isWaConnected(userId)) out.push(userId);
  }
  return out;
}
