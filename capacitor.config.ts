import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Talkaroo's Android shell.
 *
 * The app is server-rendered, its session lives in a cookie and messages
 * arrive over a live stream, so the shell loads the LIVE site instead of
 * bundling a build: a bundled front would go stale on every deploy and could
 * not hold a session. The native half lives in android/; the web half ships
 * with the normal deploy, and only a native change needs a new APK.
 *
 * `androidScheme: "https"` + `hostname` make the WebView's origin
 * https://talkaroo.app, so the Secure session cookie travels and survives a
 * restart. The default capacitor:// scheme would break both.
 *
 * It starts at /workspaces rather than "/", the marketing page the PWA
 * manifest points at. Someone who installed this came to read their team's
 * messages: signed out that route redirects to /login?next=/workspaces, and
 * signed in the launcher sends them into their workspace — one hop, and the
 * right one when somebody belongs to more than one.
 */
const config: CapacitorConfig = {
  appId: "app.talkaroo.mobile",
  appName: "Talkaroo",
  // Local shell: the launch screen and the offline screen.
  webDir: "mobile/www",
  // What the WebView paints before the site's first byte. Same as the
  // manifest's background_color, so a cold start does not flash a colour the
  // site never shows.
  backgroundColor: "#ffffff",
  server: {
    androidScheme: "https",
    hostname: "talkaroo.app",
    url: "https://talkaroo.app/workspaces",
    // Served from the bundled assets when the site cannot be reached.
    errorPath: "error.html",
  },
};

export default config;
