import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Hash,
  MessagesSquare,
  AtSign,
  Search,
  Paperclip,
  BellRing,
  Zap,
  Check,
  ArrowRight,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { MarketingHeader, MarketingFooter, ChatMockup } from "@/components/marketing";
import { posts } from "@/content/posts";
import { BRAND, BRAND_DOMAIN, BRAND_TAGLINE, BRAND_DESCRIPTION } from "@/lib/brand";

const SITE_URL =
  process.env.APP_BASE_URL?.replace(/\/+$/, "") ?? `https://${BRAND_DOMAIN}`;

const FEATURES = [
  {
    icon: Hash,
    title: "Organized channels",
    body: "A channel for every project, team and topic. Public so people can catch up, private when it matters.",
  },
  {
    icon: MessagesSquare,
    title: "Threads that stay tidy",
    body: "Take the side conversation into a thread and keep the main channel skimmable.",
  },
  {
    icon: AtSign,
    title: "Mentions & DMs",
    body: "@mention anyone or start a direct message. People get badged instantly — and emailed if they're away.",
  },
  {
    icon: Search,
    title: "Search that finds it",
    body: "Every message, file and channel, searchable in a keystroke. Nothing gets lost.",
  },
  {
    icon: Paperclip,
    title: "Files & images",
    body: "Drag in files and images. Stored on S3-compatible object storage or local disk — your call.",
  },
  {
    icon: BellRing,
    title: "Real-time, always",
    body: "Messages and reactions land instantly over a live connection — no refreshing, no polling.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Create a workspace",
    body: "Sign up and spin up your team's home in seconds. No credit card.",
  },
  {
    n: "2",
    title: "Invite your team",
    body: "Add people by email — they get an invite link and land in the right channels.",
  },
  {
    n: "3",
    title: "Start talking",
    body: "Channels, threads, DMs and search. Everything your team needs to stay in sync.",
  },
];

const PLANS = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    blurb: "Everything a small team needs to start talking.",
    cta: "Get started free",
    href: "/register",
    highlight: false,
    features: [
      "Unlimited public & private channels",
      "Threads, DMs & group messages",
      "Mentions, search & file sharing",
      "Email notifications",
    ],
  },
  {
    name: "Team",
    price: "Custom",
    cadence: "get in touch",
    blurb: "For organizations that want admin control and support.",
    cta: "Contact us",
    href: "/register",
    highlight: true,
    features: [
      "Everything in Free",
      "Roles, admin controls & audit log",
      "Priority support",
      "Onboarding help",
    ],
  },
  {
    name: "Self-host",
    price: "Free",
    cadence: "open",
    blurb: "Run it on your own infrastructure and own your data.",
    cta: "Read the docs",
    href: "/blog/why-open-team-chat",
    highlight: false,
    features: [
      "Deploy anywhere — one web process + Postgres",
      "Your data on your servers",
      "S3-compatible or local file storage",
      "No seat-based surprises",
    ],
  },
];

const FAQS = [
  {
    q: `What is ${BRAND}?`,
    a: `${BRAND} is a team-chat app — channels, threads, direct messages, mentions, search and file sharing — that keeps your whole team in sync and can run anywhere.`,
  },
  {
    q: "How is it different from other chat tools?",
    a: "It's fast, focused and yours to run. You can use the hosted app or self-host it on your own infrastructure, so your history and data stay under your control.",
  },
  {
    q: "Can I self-host it?",
    a: "Yes. It runs as a single web process backed by Postgres, with file storage on any S3-compatible service or local disk. Deploy it, point a domain at it, and you're live.",
  },
  {
    q: "Is it really real-time?",
    a: "Yes — messages, reactions and unread badges update instantly over a live server-sent-events connection, with no fixed-interval polling.",
  },
  {
    q: "Does it notify people who are away?",
    a: "Yes. If someone misses messages while they're offline, they get an email digest so nothing important slips through.",
  },
];

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect("/workspaces");

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: BRAND,
      url: SITE_URL,
      description: BRAND_DESCRIPTION,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: BRAND,
      url: SITE_URL,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];

  return (
    <div className="flex min-h-full flex-col bg-white text-neutral-900">
      <MarketingHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="talk-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-linear-to-b from-[#7c3aed]/[0.07] via-[#7c3aed]/[0.02] to-transparent"
        />
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-14 sm:px-6 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <span
              className="talk-rise inline-flex items-center gap-1.5 rounded-full border border-[#7c3aed]/15 bg-[#7c3aed]/5 px-3 py-1 text-xs font-medium text-[#7c3aed]"
              style={{ animationDelay: "0.05s" }}
            >
              <Zap className="size-3.5" /> Open team chat · self-hostable
            </span>
            <h1
              className="talk-rise mt-5 text-balance text-4xl font-extrabold tracking-tight sm:text-6xl"
              style={{ animationDelay: "0.15s" }}
            >
              {BRAND_TAGLINE}
            </h1>
            <p
              className="talk-rise mx-auto mt-5 max-w-2xl text-pretty text-lg text-neutral-600"
              style={{ animationDelay: "0.25s" }}
            >
              {BRAND_DESCRIPTION}
            </p>
            <div
              className="talk-rise mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ animationDelay: "0.35s" }}
            >
              <Link
                href="/register"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#7c3aed] px-6 py-3 font-semibold text-white shadow-lg shadow-[#7c3aed]/20 transition hover:bg-[#6d28d9] hover:shadow-xl hover:shadow-[#7c3aed]/25 sm:w-auto"
              >
                Get started free <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-xl border px-6 py-3 font-semibold transition hover:bg-neutral-50 sm:w-auto"
              >
                Sign in
              </Link>
            </div>
            <p
              className="talk-rise mt-4 text-sm text-neutral-500"
              style={{ animationDelay: "0.45s" }}
            >
              No credit card required · Free forever for small teams
            </p>
          </div>

          <div
            className="talk-rise mx-auto mt-14 max-w-4xl"
            style={{ animationDelay: "0.55s" }}
          >
            <div className="talk-float">
              <ChatMockup />
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-y bg-neutral-50">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 text-center sm:px-6 md:grid-cols-4">
          {[
            { k: "Real-time", v: "Instant delivery" },
            { k: "Self-host", v: "Own your data" },
            { k: "Unlimited", v: "History & channels" },
            { k: "Secure", v: "Roles & audit log" },
          ].map((s) => (
            <div key={s.k}>
              <p className="text-lg font-bold text-[#7c3aed]">{s.k}</p>
              <p className="text-sm text-neutral-500">{s.v}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything your team needs to communicate
          </h2>
          <p className="mt-3 text-neutral-600">
            The essentials of great team chat, done fast and kept simple.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border bg-white p-6 transition hover:border-[#7c3aed]/30 hover:shadow-lg"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-[#7c3aed]/10 text-[#7c3aed]">
                <f.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-neutral-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Up and running in minutes
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl border bg-white p-6">
                <span className="flex size-9 items-center justify-center rounded-full bg-[#7c3aed] text-sm font-bold text-white">
                  {s.n}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-neutral-600">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Simple, honest pricing
          </h2>
          <p className="mt-3 text-neutral-600">
            Start free. Grow when you&rsquo;re ready. Or run it yourself.
          </p>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={
                "relative flex flex-col rounded-2xl border p-6 " +
                (p.highlight
                  ? "border-[#7c3aed] shadow-xl ring-1 ring-[#7c3aed]"
                  : "bg-white")
              }
            >
              {p.highlight && (
                <span className="absolute -top-3 left-6 rounded-full bg-[#7c3aed] px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-4xl font-extrabold tracking-tight">{p.price}</span>
                <span className="text-sm text-neutral-500">/ {p.cadence}</span>
              </div>
              <p className="mt-2 text-sm text-neutral-600">{p.blurb}</p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-[#0b6e4f]" />
                    <span className="text-neutral-700">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={p.href}
                className={
                  "mt-6 inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-semibold transition " +
                  (p.highlight
                    ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9]"
                    : "border hover:bg-neutral-50")
                }
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Blog */}
      <section className="bg-neutral-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                From the blog
              </h2>
              <p className="mt-2 text-neutral-600">
                Ideas on team communication and how we build.
              </p>
            </div>
            <Link
              href="/blog"
              className="hidden shrink-0 text-sm font-semibold text-[#7c3aed] hover:underline sm:block"
            >
              All posts →
            </Link>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {posts.slice(0, 3).map((p) => (
              <Link
                key={p.slug}
                href={`/blog/${p.slug}`}
                className="group flex flex-col rounded-2xl border bg-white p-6 transition hover:shadow-lg"
              >
                <p className="text-xs font-medium text-neutral-400">
                  {new Date(p.date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  · {p.readingMinutes} min read
                </p>
                <h3 className="mt-2 font-semibold leading-snug group-hover:text-[#7c3aed]">
                  {p.title}
                </h3>
                <p className="mt-1.5 line-clamp-3 text-sm text-neutral-600">
                  {p.description}
                </p>
                <span className="mt-3 text-sm font-medium text-[#7c3aed]">Read →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto w-full max-w-3xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">
          Frequently asked questions
        </h2>
        <div className="mt-10 divide-y rounded-2xl border">
          {FAQS.map((f) => (
            <details key={f.q} className="group px-6 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium">
                {f.q}
                <span className="ml-4 text-neutral-400 transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-neutral-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto mb-16 w-full max-w-6xl px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-[#7c3aed] px-6 py-14 text-center text-white sm:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-20 [background:radial-gradient(600px_circle_at_50%_-20%,#fff,transparent)]"
          />
          <h2 className="relative text-3xl font-bold sm:text-4xl">
            Bring your team together
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-white/80">
            Create your workspace in seconds and invite the team by email. It&rsquo;s
            free to start.
          </p>
          <Link
            href="/register"
            className="relative mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-[#7c3aed] transition hover:bg-white/90"
          >
            Get started free <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <MarketingFooter />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </div>
  );
}
