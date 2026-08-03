"use client";

import { useEffect } from "react";
import { isChunkLoadError, recoverFromChunkError } from "@/lib/chunk-error";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunk = isChunkLoadError(error);

  useEffect(() => {
    if (chunk) recoverFromChunkError();
  }, [chunk]);

  return (
    <div className="flex flex-1 items-center justify-center bg-background p-6">
      <div className="max-w-sm text-center">
        <h2 className="text-lg font-semibold">
          {chunk ? "Updating to the latest version…" : "This page hit a snag"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {chunk
            ? "A new version just shipped. Refreshing to load it."
            : "Something went wrong loading this page."}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-[#007a5a] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#148567]"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-md border px-3 py-1.5 text-sm font-medium transition hover:bg-accent"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
