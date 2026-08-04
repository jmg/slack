import { PublicProfileView } from "@/components/wpp/public-profile-view";

/**
 * `/wpp/u/[username]` — the public profile behind an @handle.
 *
 * Listed in `WPP_PUBLIC_PREFIXES` (see `src/proxy.ts`), so it renders signed
 * out: a handle shared with someone who has no account is worthless if the link
 * 302s to a login screen before showing who it points at. Nothing is fetched
 * here — the profile endpoint is itself readable without a session, and the
 * client view is what calls it. Like the invite page this sits *outside* the
 * `(app)` group, so there is no `WppMeProvider` above it.
 */
export default async function WppPublicProfilePage({
  params,
}: {
  // `params` is a Promise in Next 16.
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return <PublicProfileView username={username} />;
}
