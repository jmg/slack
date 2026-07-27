/*
 * Minimal service worker. Its only job is to make the app installable as a PWA
 * (add-to-home-screen, standalone display) — it deliberately does NOT cache app
 * bundles. The app already recovers from post-deploy bundle changes on its own
 * (see chunk-error handling), and an eager precache would reintroduce exactly the
 * stale-asset problem we work to avoid. So: activate immediately, then pass every
 * request straight through to the network.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request));
});
