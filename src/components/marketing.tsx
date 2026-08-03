import Link from "next/link";
import { BRAND } from "@/lib/brand";

function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold ${className}`}>
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden className="rounded-md">
        <rect width="32" height="32" rx="7" fill="#7c3aed" />
        <path
          d="M8 12.5C8 9.462 10.462 7 13.5 7h5C21.538 7 24 9.462 24 12.5S21.538 18 18.5 18H14l-4 3.5c-.66.577-1.5.106-1.5-.66V18.2A5.5 5.5 0 0 1 8 14.5z"
          fill="#fff"
        />
        <circle cx="13" cy="12.5" r="1.4" fill="#7c3aed" />
        <circle cx="16.5" cy="12.5" r="1.4" fill="#7c3aed" />
        <circle cx="20" cy="12.5" r="1.4" fill="#7c3aed" />
      </svg>
      <span>{BRAND}</span>
    </span>
  );
}

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-black/5 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" aria-label={BRAND}>
          <Logo />
        </Link>
        <nav className="ml-auto hidden items-center gap-1 text-sm font-medium text-neutral-600 md:flex">
          <Link href="/#features" className="rounded-md px-3 py-2 transition hover:text-neutral-900">
            Features
          </Link>
          <Link href="/#pricing" className="rounded-md px-3 py-2 transition hover:text-neutral-900">
            Pricing
          </Link>
          <Link href="/blog" className="rounded-md px-3 py-2 transition hover:text-neutral-900">
            Blog
          </Link>
          <Link href="/#faq" className="rounded-md px-3 py-2 transition hover:text-neutral-900">
            FAQ
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-2 text-sm">
          <Link
            href="/login"
            className="rounded-lg px-3 py-2 font-medium text-neutral-700 transition hover:text-neutral-900"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-[#7c3aed] px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-[#6d28d9]"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  const cols: { title: string; links: { label: string; href: string }[] }[] = [
    {
      title: "Product",
      links: [
        { label: "Features", href: "/#features" },
        { label: "Pricing", href: "/#pricing" },
        { label: "FAQ", href: "/#faq" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "Blog", href: "/blog" },
        { label: "Sign in", href: "/login" },
        { label: "Create account", href: "/register" },
      ],
    },
  ];
  return (
    <footer className="border-t border-black/5 bg-neutral-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-neutral-500">
            {BRAND} is team chat that keeps everyone in sync — channels, threads,
            DMs and search, yours to run anywhere.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              {c.title}
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-neutral-600">
              {c.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="transition hover:text-neutral-900">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-black/5">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-neutral-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {BRAND}. All rights reserved.</p>
          <p>
            An independent team-chat product. Not affiliated with Slack
            Technologies, Inc.
          </p>
        </div>
      </div>
    </footer>
  );
}
