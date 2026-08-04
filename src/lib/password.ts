import "server-only";
import bcrypt from "bcryptjs";

/**
 * A valid bcrypt hash to compare against when the account doesn't exist.
 *
 * Both login routes must run exactly one bcrypt compare on every path, or the
 * response time tells an attacker which emails / phone numbers are registered.
 * That needs a real hash for the miss path.
 *
 * It is *generated* rather than written down. A literal bcrypt hash in the
 * source is a value no attacker benefits from — it hashes a throwaway string —
 * but it is indistinguishable from a leaked credential to any secret scanner,
 * and explaining that in a comment doesn't stop the alert. Hashing a random
 * UUID once per process costs one bcrypt at first use and removes the literal.
 *
 * Callers should `await` it *alongside* the account lookup rather than after it,
 * so the very first miss of a process doesn't pay for this on top of its
 * compare — which would be its own timing signal.
 */
let cached: Promise<string> | null = null;

export function dummyPasswordHash(): Promise<string> {
  cached ??= bcrypt.hash(crypto.randomUUID(), 10);
  return cached;
}
