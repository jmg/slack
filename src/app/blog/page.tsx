import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader, MarketingFooter } from "@/components/marketing";
import { posts } from "@/content/posts";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Notes on team communication and how we build a fast, open team-chat app.",
  alternates: { canonical: "/blog" },
};

export default function BlogIndex() {
  return (
    <div className="flex min-h-full flex-col">
      <MarketingHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Blog</h1>
        <p className="mt-2 text-muted-foreground">
          Notes on team communication and the engineering behind the app.
        </p>
        <div className="mt-8 divide-y">
          {posts.map((p) => (
            <article key={p.slug} className="py-6">
              <p className="text-xs text-muted-foreground">
                {new Date(p.date).toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}{" "}
                · {p.readingMinutes} min read
              </p>
              <h2 className="mt-1 text-xl font-bold leading-snug">
                <Link href={`/blog/${p.slug}`} className="hover:underline">
                  {p.title}
                </Link>
              </h2>
              <p className="mt-1.5 text-muted-foreground">{p.description}</p>
              <Link
                href={`/blog/${p.slug}`}
                className="mt-2 inline-block text-sm font-medium text-[#1264a3] hover:underline"
              >
                Read more →
              </Link>
            </article>
          ))}
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
