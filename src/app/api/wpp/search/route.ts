import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requireWaUser, type WaUserRow } from "@/lib/wpp/api";
import { requireChatMember } from "@/lib/wpp/data";
import { loadChatHeaders } from "@/lib/wpp/chats";
import {
  serializeWaMessage,
  visibleMessagesWhere,
  waMessageInclude,
} from "@/lib/wpp/messages";
import { waSearchSchema } from "@/lib/wpp/validators";
import type { WaSearchHit } from "@/lib/wpp/types";

/** Newest first, and enough to fill the results panel without paging. */
const SEARCH_LIMIT = 60;

/**
 * Search the caller's messages, optionally inside one chat.
 *
 * Visibility is not a post-filter: the `OR` arms are built from the caller's own
 * memberships, so a message they can't see never comes back to be filtered out.
 * Each arm carries that membership's "clear chat" cursor and its per-user hides,
 * because both are things one participant did that the other never sees.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const me = await requireWaUser();

    // The search box fires on every debounce tick, and each hit costs a
    // multi-chat serialization pass. Generous enough for real typing, low
    // enough that a stuck client can't spin on it.
    const limited = rateLimit(`wpp:search:${me.id}:${clientIp(req)}`, 60, 60 * 1000);
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "error.rateLimited" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
      );
    }

    const parsed = waSearchSchema.safeParse({
      q: req.nextUrl.searchParams.get("q") ?? "",
      chatId: req.nextUrl.searchParams.get("chatId") ?? undefined,
    });
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "validate.invalidInput");
    }
    const { q, chatId } = parsed.data;

    // Narrowing to a chat is still an authorization decision, so it goes
    // through the same guard the chat's own routes use.
    if (chatId) await requireChatMember(me.id, chatId);

    const memberships = await prisma.waChatMember.findMany({
      where: { userId: me.id, ...(chatId ? { chatId } : {}) },
      select: { chatId: true, clearedAt: true },
      take: 300,
    });
    if (memberships.length === 0) return NextResponse.json({ hits: [] });

    const rows = await prisma.waMessage.findMany({
      where: {
        deletedAt: null,
        // "Ada added Grace" is chat furniture, not something anyone searches for.
        kind: { not: "SYSTEM" },
        body: { contains: q, mode: "insensitive" },
        OR: memberships.map((m) =>
          visibleMessagesWhere(m.chatId, me.id, m.clearedAt),
        ),
      },
      include: waMessageInclude,
      orderBy: { createdAt: "desc" },
      take: SEARCH_LIMIT,
    });
    if (rows.length === 0) return NextResponse.json({ hits: [] });

    return NextResponse.json({ hits: await toSearchHits(me, rows) });
  });
}

type MessageRow = Parameters<typeof serializeWaMessage>[0];

/**
 * Dress raw message rows as search hits.
 *
 * Both halves are per-viewer and neither can be faked cheaply: the bubble needs
 * a chat context for its ticks and saved-alias names, and the row above it needs
 * the same title the chat list would show. `loadChatHeaders` produces both, for
 * exactly the chats in the result set, in a fixed number of queries — archived
 * chats included, since they are excluded from the default list but every bit as
 * searchable.
 */
async function toSearchHits(
  me: WaUserRow,
  rows: MessageRow[],
): Promise<WaSearchHit[]> {
  const [headers, starred] = await Promise.all([
    loadChatHeaders(me, rows.map((r) => r.chatId)),
    prisma.waMessageStar.findMany({
      where: { userId: me.id, messageId: { in: rows.map((r) => r.id) } },
      select: { messageId: true },
    }),
  ]);
  const starredIds = new Set(starred.map((s) => s.messageId));
  for (const header of headers.values()) header.context.starredIds = starredIds;

  const hits: WaSearchHit[] = [];
  for (const row of rows) {
    const header = headers.get(row.chatId);
    if (!header) continue;
    hits.push({
      message: serializeWaMessage(row, header.context),
      chatId: row.chatId,
      chatName: header.name,
      chatType: header.type,
      chatAvatarUrl: header.avatarUrl,
    });
  }
  return hits;
}
