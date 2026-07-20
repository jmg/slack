import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { requireChannelAccess, requireConversationMember } from "@/lib/data";
import { getStorage } from "@/lib/storage";
import { isInlineImage } from "@/lib/upload-limits";

/**
 * Authorized proxy for an attachment.
 *
 * Object storage is an internal-only endpoint, so browsers can't fetch it and
 * presigned URLs would be useless (and would leak past the membership check
 * anyway, since they're forwardable bearer tokens). Instead we re-check access
 * on every read and stream the object through.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { attachmentId } = await params;

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: {
        key: true,
        filename: true,
        contentType: true,
        uploaderId: true,
        messageId: true,
        message: { select: { channelId: true, conversationId: true } },
      },
    });
    if (!attachment) return apiError("File not found", 404);

    if (attachment.message) {
      // Claimed: whoever can read the message can read its files.
      if (attachment.message.channelId) {
        await requireChannelAccess(user.id, attachment.message.channelId);
      } else if (attachment.message.conversationId) {
        await requireConversationMember(user.id, attachment.message.conversationId);
      } else {
        return apiError("File not found", 404);
      }
    } else if (attachment.uploaderId !== user.id) {
      // Still pending: only the uploader can preview it.
      return apiError("File not found", 404);
    }

    const range = req.headers.get("range");
    const upstream = await getStorage().get(attachment.key, range);
    if (!upstream.ok && upstream.status !== 206) {
      return apiError("File not found", 404);
    }

    const headers = new Headers();
    headers.set("content-type", attachment.contentType);
    const length = upstream.headers.get("content-length");
    if (length) headers.set("content-length", length);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers.set("content-range", contentRange);
    headers.set("accept-ranges", "bytes");
    headers.set("cache-control", "private, max-age=3600");
    headers.set(
      "content-disposition",
      `${isInlineImage(attachment.contentType) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
    );
    // Defense in depth: never let a stored file be sniffed into something active.
    headers.set("x-content-type-options", "nosniff");
    headers.set("content-security-policy", "default-src 'none'; sandbox");

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  });
}
