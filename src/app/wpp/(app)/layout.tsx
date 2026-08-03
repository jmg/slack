import { redirect } from "next/navigation";
import { getCurrentWaUser, serializeMe } from "@/lib/wpp/auth";
import { wpp } from "@/lib/wpp/config";
import { WppMeProvider } from "@/components/wpp/i18n-provider";
import { WppRealtimeProvider } from "@/components/wpp/realtime-provider";
import { WaRail } from "@/components/wpp/wa-rail";

/**
 * The signed-in shell.
 *
 * `src/proxy.ts` already redirects anonymous visitors, but this check is not
 * redundant: the proxy verifies the token's signature and nothing else, while
 * `getCurrentWaUser` also re-reads the row — catching a revoked session or a
 * deleted account. The proxy is the fast path; this is the real gate.
 */
export default async function WppAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentWaUser();
  if (!user) redirect(wpp("/login"));

  return (
    <WppMeProvider me={serializeMe(user)}>
      <WppRealtimeProvider>
        <div className="flex h-dvh flex-1 overflow-hidden bg-[var(--wa-app)]">
          <WaRail />
          {/* pb-14 clears the phone tab bar; the rail is a column from md up. */}
          <div className="flex min-w-0 flex-1 pb-14 md:pb-0">{children}</div>
        </div>
      </WppRealtimeProvider>
    </WppMeProvider>
  );
}
