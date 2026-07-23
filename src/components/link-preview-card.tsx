"use client";

import useSWR from "swr";

type Preview = {
  ok: boolean;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
};

export function LinkPreviewCard({ url }: { url: string }) {
  const { data } = useSWR<Preview>(
    `/api/unfurl?url=${encodeURIComponent(url)}`,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  if (!data || !data.ok || (!data.title && !data.image && !data.description)) {
    return null;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 flex max-w-xl gap-3 overflow-hidden rounded-md border border-l-4 border-l-[#1264a3]/40 bg-muted/30 p-3 transition hover:bg-muted/50"
    >
      {data.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.image}
          alt=""
          loading="lazy"
          className="size-16 shrink-0 rounded object-cover"
        />
      )}
      <div className="min-w-0">
        {data.siteName && (
          <p className="truncate text-xs text-muted-foreground">{data.siteName}</p>
        )}
        {data.title && (
          <p className="truncate text-sm font-semibold text-foreground">
            {data.title}
          </p>
        )}
        {data.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {data.description}
          </p>
        )}
      </div>
    </a>
  );
}
