import { redirect } from "next/navigation";
import { getCurrentWaUser } from "@/lib/wpp/auth";
import { wpp } from "@/lib/wpp/config";

/**
 * `/wpp` — and, via the host fold-in in `src/proxy.ts`, the root of
 * wpp.talkaroo.app. Sends you to your chats or to the sign-in screen.
 */
export default async function WppHome() {
  const user = await getCurrentWaUser();
  redirect(user ? wpp("/chats") : wpp("/login"));
}
