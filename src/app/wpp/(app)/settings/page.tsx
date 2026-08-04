import { SettingsView } from "@/components/wpp/settings-view";

/**
 * `/wpp/settings`. Everything on this screen edits the signed-in account, which
 * the client already holds through `WppMeProvider` and SWR — so there is nothing
 * for the server to fetch here beyond what the layout has already resolved.
 */
export default function WppSettingsPage() {
  return <SettingsView />;
}
