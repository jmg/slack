import { BRAND } from "@/lib/brand";

/**
 * The Talkaroo logo mark — a speech bubble (matches the favicon / PWA icons).
 * Kept as one component so the brand stays consistent across the app, auth and
 * marketing surfaces.
 */
export function BrandMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label={BRAND}>
      <rect width="32" height="32" rx="7" fill="#7c3aed" />
      <path
        d="M8 12.5C8 9.462 10.462 7 13.5 7h5C21.538 7 24 9.462 24 12.5S21.538 18 18.5 18H14l-4 3.5c-.66.577-1.5.106-1.5-.66V18.2A5.5 5.5 0 0 1 8 14.5z"
        fill="#fff"
      />
      <circle cx="13" cy="12.5" r="1.4" fill="#7c3aed" />
      <circle cx="16.5" cy="12.5" r="1.4" fill="#7c3aed" />
      <circle cx="20" cy="12.5" r="1.4" fill="#7c3aed" />
    </svg>
  );
}

/** Logo mark + wordmark, for headers and the auth screens. */
export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold ${className}`}>
      <BrandMark className="size-7 rounded-md" />
      <span>{BRAND}</span>
    </span>
  );
}
