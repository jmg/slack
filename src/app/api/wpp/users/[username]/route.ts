import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { findOrCreateDirectChat } from "@/lib/wpp/data";
import { normalizeUsername } from "@/lib/wpp/username";

type Params = { params: Promise<{ username: string }> };

async function findByUsername(raw: string) {
  const username = normalizeUsername(raw);
  if (!username) throw new ApiError("error.userNotFound", 404);

  const user = await prisma.waUser.findFirst({
    where: { username, deactivatedAt: null },
    select: { id: true, name: true, username: true, avatarUrl: true, about: true },
  });
  if (!user) throw new ApiError("error.userNotFound", 404);
  return user;
}

/**
 * The public profile behind an `@handle`.
 *
 * Readable **signed out**, like the group-invite preview and for the same
 * reason: someone who was sent `talkaroo/u/ada` has to see who that is before
 * being asked to create an account.
 *
 * Only what the handle's owner already published is returned — name, handle,
 * photo, about. Never the phone number: reaching someone without giving out a
 * number is the entire point of having a handle, and leaking it here would undo
 * that in one request.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    const { username } = await params;
    return NextResponse.json(await findByUsername(username));
  });
}

/**
 * Open the 1:1 chat with whoever owns this handle, creating it on first
 * message. Signed-in only — this is the action, not the preview.
 *
 * `findOrCreateDirectChat` applies the block rules, so a handle is not a way
 * around being blocked.
 */
export async function POST(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { username } = await params;

    const user = await findByUsername(username);
    const chat = await findOrCreateDirectChat(me.id, user.id);

    return NextResponse.json({ id: chat.id, userId: user.id });
  });
}
