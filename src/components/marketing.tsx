import Link from "next/link";
import Image from "next/image";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-black/5 bg-white/80 backdrop-blur dark:border-white/10 dark:bg-[#1a1d21]/80">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <Image src="/icon-192.png" alt="" width={26} height={26} className="rounded-md" />
          <span>Slack</span>
        </Link>
        <nav className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
          <Link
            href="/blog"
            className="rounded-md px-3 py-1.5 text-muted-foreground transition hover:text-foreground"
          >
            Blog
          </Link>
          <Link
            href="/login"
            className="rounded-md px-3 py-1.5 text-muted-foreground transition hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-md bg-[#4A154B] px-3 py-1.5 font-semibold text-white transition hover:bg-[#611f69]"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-black/5 py-10 text-sm text-muted-foreground dark:border-white/10">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <Image src="/icon-192.png" alt="" width={22} height={22} className="rounded" />
          Slack
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/blog" className="transition hover:text-foreground">
            Blog
          </Link>
          <Link href="/login" className="transition hover:text-foreground">
            Sign in
          </Link>
          <Link href="/register" className="transition hover:text-foreground">
            Create account
          </Link>
        </nav>
      </div>
      <p className="mx-auto mt-6 max-w-5xl px-4 text-xs text-muted-foreground/80 sm:px-6">
        An independent, Slack-style team-chat demo built with Next.js, Postgres
        and Prisma. Not affiliated with Slack Technologies.
      </p>
    </footer>
  );
}
