import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { requireWaUser } from "@/lib/wpp/api";
import { getChatDetail } from "@/lib/wpp/chats";
import {
  ensureGroupHasAdmin,
  requireActiveChatMember,
  requireChatMember,
} from "@/lib/wpp/data";
import { publishToWaUsers } from "@/lib/wpp/events";
import { writeSystemMessage } from "@/lib/wpp/messages";
import { broadcastChatUpdated } from "@/lib/wpp/realtime";
import { waGroupUpdateSchema } from "@/lib/wpp/validators";
import {
  attachmentIdFromUrl,
  deleteWaAttachment,
  waFileUrl,
} from "@/lib/wpp/uploads";

type Params = { params: Promise<{ chatId: string }> };

/** One chat: participants, admin flags, and whether the viewer may post. */
export async function GET(_req: NextRequest, { params }: Params) {
  return handle(async () => {
    const me = await requireWaUser();
    const { chatId } = await params;
    return NextResponse.json(await getChatDetail(me, chatId));
  });
}

/**
 * Edit group info (subject, description, icon) and group settings.
 *
 * Who may do this is itself a group setting: `onlyAdminsCanEditInfo` is on by
 * default, matching WhatsApp. The two *settings* toggles are always
 * admin-only — a member can never grant themselves posting rights.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { chatId } = await params;
    const member = await requireActiveChatMember(me.id, chatId);

    if (member.chat.type !== "GROUP") {
      throw new ApiError("error.forbidden", 403);
    }

    const parsed = waGroupUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "validate.invalidInput");
    }
    const input = parsed.data;
    const isAdmin = member.role === "ADMIN";

    const changesSettings =
      input.onlyAdminsCanSend !== undefined ||
      input.onlyAdminsCanEditInfo !== undefined;
    const changesInfo =
      input.subject !== undefined ||
      input.description !== undefined ||
      input.iconAttachmentId !== undefined;

    if (changesSettings && !isAdmin) throw new ApiError("error.onlyAdmins", 403);
    if (changesInfo && member.chat.onlyAdminsCanEditInfo && !isAdmin) {
      throw new ApiError("error.onlyAdmins", 403);
    }

    const data: Record<string, unknown> = {};
    if (input.subject !== undefined) data.subject = input.subject;
    if (input.description !== undefined) data.description = input.description;
    if (input.onlyAdminsCanSend !== undefined) {
      data.onlyAdminsCanSend = input.onlyAdminsCanSend;
    }
    if (input.onlyAdminsCanEditInfo !== undefined) {
      data.onlyAdminsCanEditInfo = input.onlyAdminsCanEditInfo;
    }

    let staleIconId: string | null = null;
    if (input.iconAttachmentId !== undefined) {
      staleIconId = attachmentIdFromUrl(member.chat.iconUrl);
      if (input.iconAttachmentId === null) {
        data.iconUrl = null;
      } else {
        // `chatId: null` is what makes this a *claim* rather than a lookup:
        // setting it consumes the upload, so the same pending icon can't be
        // attached to a second group — which would leave one group's icon
        // pointing at an object the other group's next change deletes.
        const claimed = await prisma.waAttachment.updateMany({
          where: {
            id: input.iconAttachmentId,
            uploaderId: me.id,
            purpose: "GROUP_ICON",
            messageId: null,
            chatId: null,
          },
          data: { chatId },
        });
        if (claimed.count !== 1) {
          throw new ApiError("error.attachmentsUnavailable", 400);
        }
        data.iconUrl = waFileUrl(input.iconAttachmentId);
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(await getChatDetail(me, chatId));
    }

    await prisma.waChat.update({ where: { id: chatId }, data });
    if (staleIconId && staleIconId !== input.iconAttachmentId) {
      await deleteWaAttachment(staleIconId);
    }

    // Each change gets its own timeline entry, the way a group's history reads
    // in WhatsApp: "Ada changed the group name to …".
    const actor = { actorId: me.id, actorName: me.name };
    if (input.subject !== undefined) {
      await writeSystemMessage(chatId, "group.subject", {
        ...actor,
        value: input.subject,
      });
    }
    if (input.description !== undefined) {
      await writeSystemMessage(chatId, "group.description", actor);
    }
    if (input.iconAttachmentId !== undefined) {
      await writeSystemMessage(chatId, "group.icon", actor);
    }
    if (changesSettings) {
      await writeSystemMessage(chatId, "group.settings", actor);
    }

    await broadcastChatUpdated(chatId);
    return NextResponse.json(await getChatDetail(me, chatId));
  });
}

/**
 * Delete the chat — for the caller only.
 *
 * WhatsApp's "delete chat" is local: the other side keeps their copy, and a
 * later message from them starts the conversation over with just that message.
 *
 * That is implemented by moving the caller's `clearedAt` cursor to now, not by
 * dropping their membership row. Dropping it looked simpler and was wrong twice
 * over: the chat's unique `directKey` survives on the peer's row, so the caller
 * could never get a working 1:1 chat with that person again; and for a group it
 * removed an admin without running the succession in `ensureGroupHasAdmin`,
 * which can strand a group nobody is able to administer.
 *
 * Keeping the row also means there is nothing to enumerate and hide — the
 * cursor already excludes every earlier message from every query, which is why
 * this handler no longer touches `WaMessageHide` at all.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();
    const { chatId } = await params;
    const member = await requireChatMember(me.id, chatId);
    const now = new Date();

    // Deleting a group you're still in leaves it first, so the other
    // participants get the "left" system message and the group keeps an admin.
    const leaving = member.chat.type === "GROUP" && !member.leftAt;
    if (leaving) {
      await prisma.waChatMember.update({
        where: { chatId_userId: { chatId, userId: me.id } },
        data: { leftAt: now, role: "MEMBER" },
      });
      await ensureGroupHasAdmin(chatId);
      await writeSystemMessage(chatId, "member.left", {
        actorId: me.id,
        actorName: me.name,
      });
    }

    await prisma.waChatMember.update({
      where: { chatId_userId: { chatId, userId: me.id } },
      data: {
        clearedAt: now,
        lastReadAt: now,
        pinnedAt: null,
        archivedAt: null,
        mutedUntil: null,
        draft: null,
      },
    });

    if (leaving) await broadcastChatUpdated(chatId, [me.id]);
    publishToWaUsers([me.id], { kind: "chats" });

    return NextResponse.json({ ok: true });
  });
}
