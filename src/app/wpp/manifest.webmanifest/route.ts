import { cookies, headers } from "next/headers";
import { getCurrentWaUser } from "@/lib/wpp/auth";
import { WPP_LOCALE_COOKIE, resolveWppLocale, translate } from "@/lib/wpp/i18n";
import { wpp } from "@/lib/wpp/config";

/**
 * The WhatsApp app's own web manifest.
 *
 * A route handler rather than Next's `manifest.ts` convention, which only works
 * at the root of `app/` — and the root one already belongs to the Slack half.
 * Installing from `/wpp` used to hand you that manifest: a purple icon named
 * "team messaging" starting at `/`.
 *
 * `/wpp/manifest.webmanifest` contains a dot, so `src/proxy.ts` skips it — which
 * is what it needs: a manifest fetched by the browser carries no session, and
 * the signed-out gate would otherwise redirect it to the login page.
 *
 * `scope` is `/wpp`, so the installed app owns exactly this half of the deploy
 * and a link into the Slack side opens the browser instead of hijacking the
 * window.
 */
export async function GET() {
  const [user, cookieStore, headerList] = await Promise.all([
    getCurrentWaUser(),
    cookies(),
    headers(),
  ]);

  const locale = resolveWppLocale({
    user: user?.locale,
    cookie: cookieStore.get(WPP_LOCALE_COOKIE)?.value,
    acceptLanguage: headerList.get("accept-language"),
  });

  const name = translate(locale, "app.name");

  return Response.json(
    {
      id: wpp("/"),
      name: `${name} — ${translate(locale, "app.tagline")}`,
      short_name: name,
      description: translate(locale, "app.description"),
      lang: locale,
      // Straight to the chat list. The signed-out gate bounces to /wpp/login
      // from here, which is still inside `scope`.
      start_url: wpp("/chats"),
      scope: wpp("/"),
      display: "standalone",
      orientation: "portrait",
      background_color: "#111b21",
      theme_color: "#00a884",
      categories: ["social", "communication"],
      icons: [
        { src: "/wpp/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/wpp/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        // Android crops maskable icons to its own shape, so this one is
        // full-bleed with the glyph inside the safe circle.
        {
          src: "/wpp/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
      shortcuts: [
        {
          name: translate(locale, "nav.chats"),
          url: wpp("/chats"),
          icons: [{ src: "/wpp/icon-192.png", sizes: "192x192" }],
        },
        {
          name: translate(locale, "nav.status"),
          url: wpp("/status"),
          icons: [{ src: "/wpp/icon-192.png", sizes: "192x192" }],
        },
      ],
    },
    {
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        // Per-user (the language follows the account), so never shared by a CDN.
        "cache-control": "private, max-age=0, must-revalidate",
      },
    },
  );
}
