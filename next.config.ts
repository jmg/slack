import type { NextConfig } from "next";

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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
