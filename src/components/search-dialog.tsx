"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Hash, Lock, Search } from "lucide-react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SearchResult = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string; image: string | null };
  context: { type: "channel" | "dm"; name: string; href: string; isPrivate: boolean };
};

export function SearchDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length === 0) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        /* aborted or failed */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, workspaceId, open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setLoading(false);
    }
  }, [open]);

  function go(href: string) {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="sr-only">Search messages</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border px-3">
          <Search className="size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages…"
            autoFocus
            className="border-0 shadow-none focus-visible:ring-0"
          />
        </div>

        <div className="max-h-96 overflow-y-auto">
          {loading && query.trim() && (
            <p className="px-1 py-4 text-sm text-muted-foreground">Searching…</p>
          )}
          {!loading && query.trim() && results.length === 0 && (
            <p className="px-1 py-4 text-sm text-muted-foreground">
              No messages match “{query.trim()}”.
            </p>
          )}
          <ul className="flex flex-col">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => go(r.context.href)}
                  className="flex w-full flex-col gap-1 rounded-md px-2 py-2 text-left transition hover:bg-accent"
                >
                  <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                    {r.context.type === "channel" && !r.context.isPrivate ? (
                      <Hash className="size-3" />
                    ) : (
                      <Lock className="size-3" />
                    )}
                    {r.context.name}
                    <span className="ml-1 font-normal">
                      {format(new Date(r.createdAt), "MMM d, h:mm a")}
                    </span>
                  </span>
                  <span className="flex items-start gap-2">
                    <UserAvatar
                      name={r.author.name}
                      image={r.author.image}
                      className="mt-0.5 size-5"
                    />
                    <span className="min-w-0">
                      <span className="text-sm font-semibold">
                        {r.author.name}
                      </span>
                      <span className="line-clamp-2 text-sm text-foreground/80">
                        {r.body}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
