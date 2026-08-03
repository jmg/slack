import { InviteView } from "@/components/wpp/invite-view";

/**
 * `/wpp/invite/[token]` — the group-invite landing page.
 *
 * `src/proxy.ts` lets this route through signed out (a group link is useless if
 * it 302s to the login screen before showing what it points at), so nothing is
 * fetched here: the preview endpoint is itself readable without a session, and
 * the client view is what calls it. Note this sits *outside* the `(app)` group,
 * so there is no `WppMeProvider` above it — only the locale provider from
 * `src/app/wpp/layout.tsx`.
 */
export default async function WppInvitePage({
  params,
}: {
  // `params` is a Promise in Next 16.
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InviteView token={token} />;
}
