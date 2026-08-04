import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { broadcastContacts } from "@/lib/wpp/realtime";

type Params = { params: Promise<{ userId: string }> };

/**
 * Forget a contact.
 *
 * Only the address-book row goes: the chats, messages and any block stay put.
 * Afterwards the person shows up as a bare phone number again, and whatever the
 * caller limited to "my contacts" stops being visible to them — which is why
 * the other side is notified as well.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { userId } = await params;

    // deleteMany, not delete: removing a contact you never saved is a no-op,
    // not a 404 — the caller's intent ("don't have them saved") already holds.
    await prisma.waContact.deleteMany({
      where: { ownerId: me.id, contactId: userId },
    });

    await broadcastContacts([me.id, userId]);
    return NextResponse.json({ ok: true });
  });
}
