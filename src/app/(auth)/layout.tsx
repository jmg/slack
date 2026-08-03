import Link from "next/link";
import { BRAND, BRAND_TAGLINE } from "@/lib/brand";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Link href="/" aria-label={BRAND}>
            <svg width="44" height="44" viewBox="0 0 32 32" aria-hidden className="rounded-xl">
              <rect width="32" height="32" rx="7" fill="#7c3aed" />
              <path
                d="M8 12.5C8 9.462 10.462 7 13.5 7h5C21.538 7 24 9.462 24 12.5S21.538 18 18.5 18H14l-4 3.5c-.66.577-1.5.106-1.5-.66V18.2A5.5 5.5 0 0 1 8 14.5z"
                fill="#fff"
              />
              <circle cx="13" cy="12.5" r="1.4" fill="#7c3aed" />
              <circle cx="16.5" cy="12.5" r="1.4" fill="#7c3aed" />
              <circle cx="20" cy="12.5" r="1.4" fill="#7c3aed" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{BRAND}</h1>
          <p className="text-sm text-muted-foreground">{BRAND_TAGLINE}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
