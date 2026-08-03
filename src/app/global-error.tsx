"use client";

import { useEffect } from "react";
import { isChunkLoadError, recoverFromChunkError } from "@/lib/chunk-error";

// Catches errors thrown in the root layout itself. Must render its own
// <html>/<body>. A stale-bundle error here (root layout chunk changed by a
// deploy) auto-reloads to the fresh app.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const chunk = isChunkLoadError(error);

  useEffect(() => {
    if (chunk) recoverFromChunkError();
  }, [chunk]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fff",
          color: "#111",
        }}
      >
        <div style={{ maxWidth: 360, textAlign: "center", padding: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
            {chunk ? "Updating to the latest version…" : "Something went wrong"}
          </h2>
          <p style={{ marginTop: 6, fontSize: 14, color: "#666" }}>
            {chunk
              ? "A new version just shipped. Refreshing to load it."
              : "Please reload the page."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              borderRadius: 6,
              background: "#007a5a",
              color: "#fff",
              border: "none",
              padding: "6px 12px",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
