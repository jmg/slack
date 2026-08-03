import { StatusView } from "@/components/wpp/status-view";

/**
 * `/wpp/status`. The feed is per-viewer and expires on a 24-hour clock, so it is
 * fetched client-side through SWR and kept fresh by the `status` realtime signal
 * rather than rendered once on the server.
 */
export default function WppStatusPage() {
  return <StatusView />;
}
