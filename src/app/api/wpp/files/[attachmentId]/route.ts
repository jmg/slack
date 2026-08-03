import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle } from "@/lib/api";
import { getStorage } from "@/lib/storage";
import { requireWaUser } from "@/lib/wpp/api";
import {
  blockStateBetween,
  isContactOf,
  requireChatMember,
} from "@/lib/wpp/data";
import {
  isInlineImage,
  isPlayableAudio,
  isPlayableVideo,
  sanitizeFilename,
} from "@/lib/wpp/upload-limits";

type Params = { params: Promise<{ attachmentId: string }> };

/**
 * Authorized proxy for WhatsApp media.
 *
 * Object storage is an internal-only endpoint, so browsers can't fetch it and a
 * presigned URL would be worse than useless: it's a forwardable bearer token
 * that outlives the membership check that produced it. Instead every read
 * re-checks access here and the object is streamed through.
 *
 * The caller names an attachment id, never a key — the key comes off the row, so
 * there is no path for a caller to reach an object we didn't hand them.
 */
export async function GET(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const me = await requireWaUser();
    const { attachmentId } = await params;

    const attachment = await prisma.waAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        key: true,
        filename: true,
        contentType: true,
        purpose: true,
        messageId: true,
        uploaderId: true,
        message: { select: { id: true, chatId: true, deletedAt: true } },
        status: { select: { userId: true, expiresAt: true } },
      },
    });
    if (!attachment) return apiError("error.notFound", 404);

    const denied = () => apiError("error.notFound", 404);

    switch (attachment.purpose) {
      case "MESSAGE": {
        if (!attachment.message) {
          // Still pending: nobody but the uploader knows it should exist yet.
          if (attachment.uploaderId !== me.id) return denied();
          break;
        }
        // Claimed: whoever can read the message can read its media. A member
        // who left keeps read access, matching the read-only chat they keep.
        await requireChatMember(me.id, attachment.message.chatId);
        // Deleted for everyone, or deleted for this caller — either way the
        // bytes must stop being reachable, not just stop being rendered.
        if (attachment.message.deletedAt) return denied();
        const hidden = await prisma.waMessageHide.findUnique({
          where: {
            messageId_userId: { messageId: attachment.message.id, userId: me.id },
          },
          select: { id: true },
        });
        if (hidden) return denied();
        break;
      }

      case "AVATAR":
      case "GROUP_ICON":
        // Readable by any signed-in account on purpose. Profile privacy is
        // enforced upstream — `visibleProfile` decides whether a viewer is told
        // the URL at all — and the id is an unguessable cuid, so re-deriving
        // "may this person see this photo" here would mean re-resolving the
        // subject's privacy on every <img> request for no extra protection.
        break;

      case "STATUS": {
        if (!attachment.status) {
          if (attachment.uploaderId !== me.id) return denied();
          break;
        }
        // A status is over when it expires, including for its media. The
        // author keeps access to their own so "My status" still renders while
        // the sweep catches up.
        const mine = attachment.status.userId === me.id;
        if (!mine) {
          if (attachment.status.expiresAt <= new Date()) return denied();
          // The same audience rule the feed and the view endpoint apply: the
          // author saved you, and neither of you has blocked the other.
          // Without it, an id handed out before a block (or before the author
          // removed you from their contacts) keeps streaming the photo for the
          // rest of the status's life — revocation that never takes effect.
          const [isContact, blocks] = await Promise.all([
            isContactOf(attachment.status.userId, me.id),
            blockStateBetween(me.id, attachment.status.userId),
          ]);
          if (!isContact || blocks.iBlockedThem || blocks.theyBlockedMe) {
            return denied();
          }
        }
        break;
      }
    }

    const range = req.headers.get("range");
    const upstream = await getStorage().get(attachment.key, range);
    if (!upstream.ok && upstream.status !== 206) return denied();

    const headers = new Headers();
    headers.set("content-type", attachment.contentType);
    const length = upstream.headers.get("content-length");
    if (length) headers.set("content-length", length);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers.set("content-range", contentRange);
    // Seeking in a voice note or a video is a range request per drag.
    headers.set("accept-ranges", "bytes");
    // The key is a uuid, so a given id's bytes never change — cache hard, but
    // privately: this response was authorized for one account.
    headers.set("cache-control", "private, max-age=31536000, immutable");

    const inline =
      isInlineImage(attachment.contentType) ||
      isPlayableVideo(attachment.contentType) ||
      isPlayableAudio(attachment.contentType);
    // Quotes and backslashes would end the header value early; strip them
    // rather than escape, and keep the RFC 5987 form for non-ASCII names.
    const name = sanitizeFilename(attachment.filename).replace(/["\\]/g, "");
    headers.set(
      "content-disposition",
      inline
        ? "inline"
        : `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    );
    // Defense in depth: never let a stored file be sniffed into something
    // active, and never let one execute against our origin if it is opened
    // directly. This is what makes serving user uploads from our own host safe.
    headers.set("x-content-type-options", "nosniff");
    headers.set("content-security-policy", "default-src 'none'; sandbox");

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  });
}
