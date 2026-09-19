import type { NextConfig } from "next";
import { BRAND_ORIGIN } from "./src/lib/brand";

const LEGACY_MARKETING_HOSTS = [
  "slack.devcloudsoftware.com",
  "slack.deploycloud.app",
  "www.talkaroo.app",
];

// Baseline security response headers. TLS is terminated at the platform proxy;
// HSTS closes the first-visit SSL-strip window, and the rest are cheap
// defense-in-depth. A full Content-Security-Policy is intentionally omitted for
// now — it needs per-route nonces to not break the app — tracked in the audit.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async redirects() {
    return LEGACY_MARKETING_HOSTS.map((host) => ({
      // Everything except /.well-known/assetlinks.json. Android's App Links
      // verifier fetches that file from the EXACT host in the intent filter and
      // does not follow redirects, so while www answered 308 the www host never
      // verified: a link with www opened the browser instead of the app, with
      // nothing in between to say why. Serving it on both hosts is the only way
      // both verify; every other path still lives on one origin.
      source: "/:path((?!\\.well-known/assetlinks\\.json$).*)",
      has: [{ type: "host" as const, value: host }],
      destination: `${BRAND_ORIGIN}/:path*`,
      permanent: true,
    }));
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
