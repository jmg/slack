import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL =
  process.env.APP_BASE_URL?.replace(/\/+$/, "") ?? "https://slack.devcloudsoftware.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Slack — open team messaging",
    template: "%s · Slack",
  },
  description:
    "A fast, open team-chat app: channels, threads, direct messages, mentions, search and file sharing. Built with Next.js, Postgres and Prisma.",
  applicationName: "Slack",
  keywords: [
    "team chat",
    "team messaging",
    "channels",
    "threads",
    "direct messages",
    "slack clone",
    "open source chat",
  ],
  authors: [{ name: "Slack" }],
  openGraph: {
    type: "website",
    siteName: "Slack",
    url: SITE_URL,
    title: "Slack — open team messaging",
    description:
      "Channels, threads, DMs, mentions, search and file sharing — a fast open team-chat app.",
  },
  twitter: {
    card: "summary",
    title: "Slack — open team messaging",
    description:
      "Channels, threads, DMs, mentions, search and file sharing — a fast open team-chat app.",
  },
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
      </body>
    </html>
  );
}
