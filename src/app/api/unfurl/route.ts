import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser } from "@/lib/api";
import { unfurl } from "@/lib/unfurl";

export const runtime = "nodejs"; // uses node:dns / node:net
export const dynamic = "force-dynamic";

const CACHE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type Row = {
  ok: boolean;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
};

function toDto(row: Row) {
  return {
    ok: row.ok,
    title: row.title,
    description: row.description,
    image: row.imageUrl,
    siteName: row.siteName,
  };
}

/** Cached, SSRF-safe Open-Graph preview for a URL. Auth-gated (not an open proxy). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser();

    const raw = req.nextUrl.searchParams.get("url") ?? "";
    let url: string;
    try {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
      url = u.toString();
    } catch {
      return NextResponse.json({ ok: false });
    }

    const cached = await prisma.linkPreview.findUnique({ where: { url } });
    if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_MS) {
      return NextResponse.json(toDto(cached));
    }

    const p = await unfurl(url);
    const data = {
      ok: p.ok,
      title: p.title ?? null,
      description: p.description ?? null,
      imageUrl: p.imageUrl ?? null,
      siteName: p.siteName ?? null,
    };
    const saved = await prisma.linkPreview.upsert({
      where: { url },
      update: { ...data, fetchedAt: new Date() },
      create: { url, ...data },
    });
    return NextResponse.json(toDto(saved));
  });
}
