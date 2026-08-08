import type { MetadataRoute } from "next";
import { BRAND_ORIGIN } from "@/lib/brand";

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
    sitemap: `${BRAND_ORIGIN}/sitemap.xml`,
  };
}
