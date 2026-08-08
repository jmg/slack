import type { MetadataRoute } from "next";
import { posts } from "@/content/posts";
import { BRAND_ORIGIN } from "@/lib/brand";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BRAND_ORIGIN}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BRAND_ORIGIN}/blog`, changeFrequency: "weekly", priority: 0.7 },
  ];
  const postRoutes: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${BRAND_ORIGIN}/blog/${p.slug}`,
    lastModified: new Date(p.date),
    changeFrequency: "monthly",
    priority: 0.6,
  }));
  return [...staticRoutes, ...postRoutes];
}
