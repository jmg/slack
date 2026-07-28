/*
 * Kill-switch service worker. A previous build registered a pass-through SW that
 * intercepted every GET — including the SSE event stream — which could wedge the
 * app in some browsers (notably Brave). We no longer ship a SW: this one exists
 * only so browsers that still hold the old registration replace it with a worker
 * that unregisters itself, clears any caches, and hands control back to the
 * plain network. No fetch handler → it never intercepts a request.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* ignore */
      }
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      // Reload each controlled page once so it comes back with no SW attached.
      clients.forEach((c) => c.navigate(c.url));
    })(),
  );
});
