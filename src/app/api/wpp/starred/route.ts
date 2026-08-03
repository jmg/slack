import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/api";
import { requireWaUser } from "@/lib/wpp/api";
import { loadChatHeaders } from "@/lib/wpp/chats";
import {
  serializeWaMessage,
  visibleMessagesWhere,
  waMessageInclude,
} from "@/lib/wpp/messages";
import type { WaSearchHit } from "@/lib/wpp/types";

/** Plenty for the panel; a star is a bookmark, not an archive. */
const STARRED_LIMIT = 200;

/**
 * The caller's starred messages, most recently starred first.
 *
 * A star outlives everything except the message itself, so the same visibility
 * rules as search apply on the way out: starring a message doesn't pin a copy,
 * and leaving a group, clearing a chat or the sender deleting the message all
 * take the entry with them. Hits share the search shape — the client renders the
 * two panels with the same row component.
 */
export async function GET() {
  return handle(async () => {
    const me = await requireWaUser();

    const memberships = await prisma.waChatMember.findMany({
      where: { userId: me.id },
      select: { chatId: true, clearedAt: true },
      take: 300,
    });
    if (memberships.length === 0) return NextResponse.json({ hits: [] });

    const stars = await prisma.waMessageStar.findMany({
      where: {
        userId: me.id,
        message: {
          deletedAt: null,
          kind: { not: "SYSTEM" },
          OR: memberships.map((m) =>
            visibleMessagesWhere(m.chatId, me.id, m.clearedAt),
          ),
        },
      },
      include: { message: { include: waMessageInclude } },
      orderBy: { createdAt: "desc" },
      take: STARRED_LIMIT,
    });
    if (stars.length === 0) return NextResponse.json({ hits: [] });

    const rows = stars.map((s) => s.message);

    // Titles and per-viewer contexts for just the chats these hits came from —
    // `listChatSummaries` would load every chat the user has, twice, to answer
    // the same question.
    const headers = await loadChatHeaders(me, rows.map((r) => r.chatId));

    // Everything in this list is starred by definition — no second lookup.
    const starredIds = new Set(rows.map((r) => r.id));
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

    return NextResponse.json({ hits });
  });
}
