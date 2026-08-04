import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requireWaUser } from "@/lib/wpp/api";
import {
  checkUsername,
  normalizeUsername,
  type UsernameProblem,
} from "@/lib/wpp/username";
import type { WppKey } from "@/lib/wpp/i18n";

/** Rule violation → the dictionary key naming it. */
const PROBLEM_KEYS: Record<UsernameProblem, WppKey> = {
  tooShort: "username.errTooShort",
  tooLong: "username.errTooLong",
  charset: "username.errCharset",
  start: "username.errStart",
  end: "username.errEnd",
  doubleUnderscore: "username.errDoubleUnderscore",
  reserved: "username.errReserved",
};

/**
 * Is this handle free? Drives the live "@ada is available" line in Settings.
 *
 * Signed-in only and rate-limited, because it is an existence oracle by nature:
 * left open it would be a fast scanner for which handles are taken. A handle is
 * meant to be public, so this is far less sensitive than the phone lookup — but
 * there is no reason to hand out the scanner either.
 *
 * The answer is advisory. Two people can pass this check for the same handle at
 * the same moment; the unique index is what actually decides, and the PATCH
 * surfaces that as `username.errTaken`.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const me = await requireWaUser();

    const limited = rateLimit(
      `wpp:username:${me.id}:${clientIp(req)}`,
      60,
      60 * 1000,
    );
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "error.rateLimited" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
      );
    }

    const username = normalizeUsername(req.nextUrl.searchParams.get("u") ?? "");
    const problem = checkUsername(username);
    if (problem) {
      return NextResponse.json({
        username,
        available: false,
        problem: PROBLEM_KEYS[problem],
      });
    }

    const taken = await prisma.waUser.findUnique({
      where: { username },
      select: { id: true },
    });
    // Your own handle reads as available — otherwise re-saving an unchanged
    // profile would tell you your own username is taken.
    const available = !taken || taken.id === me.id;

    return NextResponse.json({
      username,
      available,
      problem: available ? null : ("username.errTaken" satisfies WppKey),
    });
  });
}
