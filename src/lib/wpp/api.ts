import "server-only";
import { ApiError } from "@/lib/api";
import { getCurrentWaUser } from "@/lib/wpp/auth";

/**
 * Route-handler guard for the WhatsApp API. `handle()`, `apiError()` and
 * `ApiError` itself are shared with the Slack half (`src/lib/api.ts`) — only
 * *who* is authenticated differs, so only that part is re-implemented here.
 *
 * Every `/api/wpp/**` handler follows the same shape:
 *
 * ```ts
 * export async function POST(req, { params }) {
 *   return handle(async () => {
 *     const me = await requireWaUser();
 *     const { chatId } = await params;              // params is a Promise in Next 16
 *     const member = await requireChatMember(me.id, chatId);   // lib/wpp/data.ts
 *     const parsed = sendMessageSchema.safeParse(await req.json());
 *     …
 *   });
 * }
 * ```
 */
export async function requireWaUser() {
  const user = await getCurrentWaUser();
  if (!user) {
    throw new ApiError("Unauthorized", 401);
  }
  return user;
}

export type WaUserRow = Awaited<ReturnType<typeof requireWaUser>>;
