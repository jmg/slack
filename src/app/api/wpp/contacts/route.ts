import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requireWaUser } from "@/lib/wpp/api";
import { contactIdsOf, listWaContactItems } from "@/lib/wpp/data";
import { broadcastContacts } from "@/lib/wpp/realtime";
import { waContactSchema } from "@/lib/wpp/validators";

/** The caller's address book, already filtered through everyone's privacy. */
export async function GET() {
  return handle(async () => {
    const me = await requireWaUser();
    const saved = await contactIdsOf(me.id);
    return NextResponse.json({
      contacts: await listWaContactItems(me, [...saved]),
    });
  });
}

/**
 * Save a contact by phone number — the only way to find someone here, exactly
 * like WhatsApp: there is no directory and no name search across accounts.
 *
 * That makes this endpoint an existence oracle for phone numbers, so it is rate
 * limited per account. The answer itself can't be softened without breaking the
 * feature, but grinding through a country's numbering plan is stopped here.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();

    const limited = rateLimit(`wpp:contact:${me.id}:${clientIp(req)}`, 20, 60 * 1000);
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "error.rateLimited" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
      );
    }

    const parsed = waContactSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "validate.invalidInput");
    }
    const { phone, alias } = parsed.data;

    if (phone === me.phone) return apiError("newChat.cannotAddSelf", 400);

    // The schema already normalised the input to E.164, which is the form the
    // column is unique on — so this is an exact match, not a search.
    const other = await prisma.waUser.findFirst({
      where: { phone, deactivatedAt: null },
      select: { id: true },
    });
    if (!other) return apiError("newChat.notFound", 404);

    await prisma.waContact.upsert({
      where: { ownerId_contactId: { ownerId: me.id, contactId: other.id } },
      create: { ownerId: me.id, contactId: other.id, alias: alias || null },
      // Re-adding someone is how you rename them, so a new alias wins — but an
      // omitted one must not wipe the name they're already saved under.
      update: alias ? { alias } : {},
    });

    // Both sides care. The caller's chat list now shows a saved name instead of
    // a phone number; the other account is now looking at someone who has them
    // in their address book, which is what "my contacts" privacy keys off.
    await broadcastContacts([me.id, other.id]);

    const [item] = await listWaContactItems(me, [other.id]);
    if (!item) throw new ApiError("error.userNotFound", 404);
    return NextResponse.json(item);
  });
}
