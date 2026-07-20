import "server-only";
import { ApiError } from "@/lib/api";
import { isInlineImage, type SerializedAttachment } from "@/lib/upload-limits";

/**
 * Minimal shape of a Prisma transaction client, so callers can pass the `tx`
 * from `prisma.$transaction(async (tx) => …)` without importing generated types.
 */
type TxLike = {
  attachment: {
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
};

/**
 * Attach pending uploads to a message being created, in the same transaction.
 *
 * The filter is the authorization: an attachment can only be claimed by the user
 * who uploaded it, and only while it is still unclaimed. If any id fails to
 * match we throw, which rolls the message creation back — so a message never
 * ships with someone else's file or a file that's already on another message.
 */
export async function claimAttachments(
  tx: TxLike,
  {
    attachmentIds,
    userId,
    messageId,
  }: { attachmentIds: string[] | undefined; userId: string; messageId: string },
): Promise<void> {
  if (!attachmentIds || attachmentIds.length === 0) return;

  const unique = [...new Set(attachmentIds)];
  const { count } = await tx.attachment.updateMany({
    where: { id: { in: unique }, uploaderId: userId, messageId: null },
    data: { messageId },
  });

  if (count !== unique.length) {
    throw new ApiError("Some attachments are no longer available", 400);
  }
}

type AttachmentRow = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
};

export function serializeAttachment(a: AttachmentRow): SerializedAttachment {
  return {
    id: a.id,
    filename: a.filename,
    contentType: a.contentType,
    size: a.size,
    width: a.width,
    height: a.height,
    isImage: isInlineImage(a.contentType),
    url: `/api/files/${a.id}`,
  };
}
