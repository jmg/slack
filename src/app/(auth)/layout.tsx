import { Hash } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-[#4a154b] text-white">
            <Hash className="size-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Slack</h1>
          <p className="text-sm text-muted-foreground">
            Team messaging, rebuilt with Next.js &amp; Prisma.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
