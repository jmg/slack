import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Hash,
  MessagesSquare,
  AtSign,
  Search,
  Paperclip,
  BellRing,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { MarketingHeader, MarketingFooter } from "@/components/marketing";
import { posts } from "@/content/posts";

const FEATURES = [
  {
    icon: Hash,
    title: "Channels",
    body: "Organize work by topic. Public by default so anyone can catch up, private when it matters.",
  },
  {
    icon: MessagesSquare,
    title: "Threads & DMs",
    body: "Keep side conversations tidy in threads, and go one-to-one (or small group) in direct messages.",
  },
  {
    icon: AtSign,
    title: "Mentions",
    body: "@mention someone by name and they get badged — and emailed if they're away.",
  },
  {
    icon: Search,
    title: "Search",
    body: "Find any message, file or channel in seconds. Chat is only useful if you can find it later.",
  },
  {
    icon: Paperclip,
    title: "File sharing",
    body: "Drag in images and files. Stored on S3-compatible object storage or local disk — your call.",
  },
  {
    icon: BellRing,
    title: "Live & notified",
    body: "Instant updates over Server-Sent Events, unread badges, and email digests when you miss something.",
  },
];

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/workspaces");

  return (
    <div className="flex min-h-full flex-col">
      <MarketingHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-b from-[#4A154B]/10 to-transparent"
        />
        <div className="mx-auto max-w-5xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
          <h1 className="mx-auto max-w-3xl text-balance text-4xl font-extrabold tracking-tight sm:text-6xl">
            Where your team&rsquo;s work comes together
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-muted-foreground">
            Channels, threads, direct messages, mentions, search and file
            sharing — a fast, open team-chat app you can run anywhere.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="w-full rounded-lg bg-[#4A154B] px-6 py-3 text-center font-semibold text-white transition hover:bg-[#611f69] sm:w-auto"
            >
              Get started free
            </Link>
            <Link
              href="/login"
              className="w-full rounded-lg border px-6 py-3 text-center font-semibold transition hover:bg-muted sm:w-auto"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border p-5">
              <span className="flex size-10 items-center justify-center rounded-lg bg-[#4A154B]/10 text-[#4A154B] dark:text-[#d6a3da]">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Blog teaser */}
      <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-bold">From the blog</h2>
          <Link href="/blog" className="text-sm font-medium text-[#1264a3] hover:underline">
            All posts →
          </Link>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {posts.slice(0, 3).map((p) => (
            <Link
              key={p.slug}
              href={`/blog/${p.slug}`}
              className="rounded-xl border p-5 transition hover:bg-muted/40"
            >
              <p className="text-xs text-muted-foreground">
                {new Date(p.date).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
              <h3 className="mt-1 font-semibold leading-snug">{p.title}</h3>
              <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">
                {p.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto mb-12 w-full max-w-5xl px-4 sm:px-6">
        <div className="rounded-2xl bg-[#4A154B] px-6 py-12 text-center text-white">
          <h2 className="text-2xl font-bold sm:text-3xl">Ready when your team is</h2>
          <p className="mx-auto mt-2 max-w-xl text-white/80">
            Create a workspace in seconds. Invite the team by email and start
            talking.
          </p>
          <Link
            href="/register"
            className="mt-6 inline-block rounded-lg bg-white px-6 py-3 font-semibold text-[#4A154B] transition hover:bg-white/90"
          >
            Get started free
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
