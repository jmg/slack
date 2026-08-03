import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.APP_BASE_URL?.replace(/\/+$/, "") ?? "https://slack.devcloudsoftware.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/blog"],
        // Keep authenticated app surfaces out of the index.
        disallow: ["/w/", "/workspaces", "/api/", "/invite/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
