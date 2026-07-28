import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { GoogleAnalytics } from "@/components/google-analytics";
import { BRAND, BRAND_DOMAIN, BRAND_DESCRIPTION } from "@/lib/brand";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL =
  process.env.APP_BASE_URL?.replace(/\/+$/, "") ?? `https://${BRAND_DOMAIN}`;

const TITLE = `${BRAND} — team messaging that keeps everyone in sync`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: `%s · ${BRAND}`,
  },
  description: BRAND_DESCRIPTION,
  applicationName: BRAND,
  keywords: [
    "team chat",
    "team messaging",
    "team communication",
    "channels",
    "threads",
    "direct messages",
    "self-hosted chat",
    "open source chat",
  ],
  authors: [{ name: BRAND }],
  openGraph: {
    type: "website",
    siteName: BRAND,
    url: SITE_URL,
    title: TITLE,
    description: BRAND_DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: BRAND_DESCRIPTION,
    images: ["/og.png"],
  },
  appleWebApp: {
    capable: true,
    title: BRAND,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1d21" },
  ],
  // Let the app fill the notch/safe areas when installed to the home screen.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>{children}</Providers>
        <GoogleAnalytics />
      </body>
    </html>
  );
}
