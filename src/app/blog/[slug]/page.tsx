import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MarketingHeader, MarketingFooter } from "@/components/marketing";
import { getPost, posts } from "@/content/posts";

export function generateStaticParams() {
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Post not found" };
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      publishedTime: post.date,
      url: `/blog/${post.slug}`,
    },
  };
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { "@type": "Organization", name: post.author },
  };

  return (
    <div className="flex min-h-full flex-col">
      <MarketingHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> All posts
        </Link>
        <article className="mt-6">
          <p className="text-sm text-muted-foreground">
            {new Date(post.date).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}{" "}
            · {post.readingMinutes} min read · {post.author}
          </p>
          <h1 className="mt-2 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
            {post.title}
          </h1>
          <div
            className="mt-8 text-[15px] leading-relaxed text-foreground/90 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:tracking-tight [&_p]:mt-4 [&_strong]:font-semibold"
          >
            {post.body}
          </div>
        </article>

        <div className="mt-12 rounded-xl border bg-muted/30 p-6 text-center">
          <p className="font-semibold">Try it with your team</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a workspace and invite people by email in seconds.
          </p>
          <Link
            href="/register"
            className="mt-4 inline-block rounded-lg bg-[#4A154B] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#611f69]"
          >
            Get started free
          </Link>
        </div>
      </main>
      <MarketingFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
