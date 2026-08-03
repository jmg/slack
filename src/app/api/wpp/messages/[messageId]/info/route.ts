import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, handle } from "@/lib/api";
import { requireWaUser } from "@/lib/wpp/api";
import { canSeeField, requireMessageAccess } from "@/lib/wpp/data";
import { loadContactMaps } from "@/lib/wpp/messages";
import type { WaMessageInfo } from "@/lib/wpp/types";

type Params = { params: Promise<{ messageId: string }> };

/**
 * "Message info": who has received this message, and who has read it.
 *
 * Only ever for your own messages — WhatsApp shows this screen to the sender
 * alone, and exposing it for someone else's message would hand every group
 * member a read-receipt log for everyone else.
 *
 * The same reciprocity `computeTick` applies holds here: in a 1:1 chat a peer
 * who turned read receipts off contributes no read time (and neither do you, so
 * you can't see theirs), while inside a group the setting is ignored — matching
 * WhatsApp, where group read receipts can't be disabled.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    const me = await requireWaUser();
    const { messageId } = await params;
    const message = await requireMessageAccess(me.id, messageId);

    if (message.senderId !== me.id || message.deletedAt) {
      throw new ApiError("error.forbidden", 403);
    }

    const members = await prisma.waChatMember.findMany({
      where: { chatId: message.chatId, userId: { not: me.id }, leftAt: null },
      select: {
        userId: true,
        lastReadAt: true,
        lastDeliveredAt: true,
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            avatarPrivacy: true,
            readReceipts: true,
          },
        },
      },
    });

    const contacts = await loadContactMaps(
      me.id,
      members.map((m) => m.userId),
    );

    const isGroup = message.chat.type === "GROUP";
    const sentAt = message.createdAt.getTime();
    const read: WaMessageInfo["read"] = [];
    const delivered: WaMessageInfo["delivered"] = [];

    for (const member of members) {
      const person = {
        id: member.userId,
        name: contacts.aliasById.get(member.userId) ?? member.user.name,
        avatarUrl:
          !contacts.blockedMe.has(member.userId) &&
          canSeeField(member.user.avatarPrivacy, {
            isMe: false,
            isContact: contacts.iAmTheirContact.has(member.userId),
          })
            ? member.user.avatarUrl
            : null,
      };

      const receiptsVisible =
        isGroup || (member.user.readReceipts && me.readReceipts);

      if (receiptsVisible && member.lastReadAt.getTime() >= sentAt) {
        read.push({ ...person, at: member.lastReadAt.toISOString() });
      } else if (member.lastDeliveredAt.getTime() >= sentAt) {
        delivered.push({ ...person, at: member.lastDeliveredAt.toISOString() });
      } else {
        // Not delivered yet — WhatsApp simply omits them from both lists.
        continue;
      }
    }

    const info: WaMessageInfo = {
      createdAt: message.createdAt.toISOString(),
      // The cursors are per-member, not per-message, so these are "seen at or
      // after this message was sent" rather than an exact per-message ack. That
      // is precisely what the ticks are computed from, so the screen and the
      // ticks can never disagree.
      read,
      delivered,
      totalRecipients: members.length,
    };

    return NextResponse.json(info);
  });
}
