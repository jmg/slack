import "server-only";
import net from "node:net";
import { lookup } from "node:dns/promises";

/**
 * Open-Graph link unfurler with SSRF protection. The threat: a user posts a URL
 * whose host (directly or via redirect) resolves to an internal address, and we
 * fetch it — exposing the platform's private network / metadata endpoints. So we
 * resolve every hop's hostname and refuse any private/reserved IP, cap time and
 * size, follow redirects manually (re-validating each), and only parse HTML.
 */

export type Preview = {
  ok: boolean;
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
};

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 512_000;
const MAX_REDIRECTS = 3;

function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    const [a, b] = p;
    return (
      a === 0 || // "this" network
      a === 10 || // private
      a === 127 || // loopback
      (a === 169 && b === 254) || // link-local (incl. cloud metadata 169.254.169.254)
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 168) || // private
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      a >= 224 // multicast + reserved
    );
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    return (
      low === "::1" || // loopback
      low === "::" || // unspecified
      low.startsWith("fc") || // unique-local
      low.startsWith("fd") ||
      low.startsWith("fe80") || // link-local
      low.startsWith("::ffff:") // IPv4-mapped — could wrap a private v4
    );
  }
  return true; // unknown format → block
}

async function assertPublicHost(hostname: string): Promise<void> {
  // A bare IP literal in the URL is checked directly; otherwise resolve it.
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new Error("blocked address");
    return;
  }
  const addrs = await lookup(hostname, { all: true });
  if (addrs.length === 0) throw new Error("no address");
  for (const a of addrs) {
    if (isBlockedIp(a.address)) throw new Error("blocked address");
  }
}

async function safeFetch(start: URL): Promise<Response | null> {
  let url = start;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    await assertPublicHost(url.hostname); // throws on private/reserved

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        redirect: "manual", // we follow ourselves so each hop is re-validated
        headers: {
          "user-agent": "SlackCloneBot/1.0 (+link preview)",
          accept: "text/html,application/xhtml+xml",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      url = new URL(loc, url); // may be relative
      continue;
    }
    return res;
  }
  return null; // too many redirects
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let html = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    html += decoder.decode(value, { stream: true });
    if (bytes >= MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return html;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

function metaContent(html: string, key: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`,
    "i",
  );
  const tag = re.exec(html)?.[0];
  if (!tag) return undefined;
  const c = /content=["']([^"']*)["']/i.exec(tag);
  return c?.[1] ? decodeEntities(c[1]).trim() : undefined;
}

const clamp = (s: string | undefined, n: number) =>
  s ? s.slice(0, n) : undefined;

/** Fetch and parse an OG preview. Returns { ok: false } on any failure. */
export async function unfurl(rawUrl: string): Promise<Preview> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false };

  try {
    const res = await safeFetch(url);
    if (!res || !res.ok) return { ok: false };
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) return { ok: false };

    const html = await readCapped(res);
    const title =
      metaContent(html, "og:title") ??
      (() => {
        const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
        return m?.[1] ? decodeEntities(m[1]).trim() : undefined;
      })();
    const description =
      metaContent(html, "og:description") ?? metaContent(html, "description");
    let imageUrl = metaContent(html, "og:image");
    if (imageUrl) {
      try {
        // Resolve relative image URLs; only keep http(s).
        const abs = new URL(imageUrl, url);
        imageUrl = abs.protocol === "http:" || abs.protocol === "https:"
          ? abs.toString()
          : undefined;
      } catch {
        imageUrl = undefined;
      }
    }
    const siteName = metaContent(html, "og:site_name") ?? url.hostname;

    if (!title && !description && !imageUrl) return { ok: false };
    return {
      ok: true,
      title: clamp(title, 300),
      description: clamp(description, 500),
      imageUrl: clamp(imageUrl, 1000),
      siteName: clamp(siteName, 100),
    };
  } catch {
    return { ok: false };
  }
}
