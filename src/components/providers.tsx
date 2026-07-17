"use client";

import { SWRConfig } from "swr";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

async function defaultFetcher(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Request failed");
  }
  return res.json();
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ fetcher: defaultFetcher, revalidateOnFocus: true }}>
      <TooltipProvider delay={200}>{children}</TooltipProvider>
      <Toaster richColors position="top-center" />
    </SWRConfig>
  );
}
