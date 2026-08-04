import "server-only";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
import {
  attachmentKind,
  decodeWaveform,
  type WppSerializedAttachment,
} from "@/lib/wpp/upload-limits";

/**
 * Two-phase upload, same shape as the Slack half: the composer POSTs files
 * first (rows land with `messageId: null`), then sends the message with their
 * ids. The claim happens *inside* the message-create transaction, so a message
 * can never ship with someone else's file — and a bad id rolls the whole send
 * back rather than leaving a half-attached message.
 */

/** Minimal shape of a Prisma transaction client, so callers can pass their `tx`. */
type TxLike = {
  waAttachment: {
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
};

/**
 * Attach pending uploads to a message.
 *
 * The `where` clause *is* the authorization: only the uploader, only while the
 * row is still unclaimed. If any id fails to match, the count comes up short
 * and we throw — rolling back the surrounding transaction.
 */
export async function claimWaAttachments(
  tx: TxLike,
  {
    attachmentIds,
    userId,
    messageId,
    chatId,
  }: {
    attachmentIds: string[] | undefined;
    userId: string;
    messageId: string;
    chatId: string;
  },
): Promise<void> {
  if (!attachmentIds || attachmentIds.length === 0) return;

  const unique = [...new Set(attachmentIds)];
  const { count } = await tx.waAttachment.updateMany({
    where: { id: { in: unique }, uploaderId: userId, messageId: null },
    data: { messageId, chatId },
  });

  if (count !== unique.length) {
    throw new ApiError("error.attachmentsUnavailable", 400);
  }
}

type WaAttachmentRow = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  waveform: string | null;
};

export function serializeWaAttachment(
  a: WaAttachmentRow,
  opts?: { voice?: boolean },
): WppSerializedAttachment {
  return {
    id: a.id,
    filename: a.filename,
    contentType: a.contentType,
    size: a.size,
    width: a.width,
    height: a.height,
    durationMs: a.durationMs,
    waveform: decodeWaveform(a.waveform),
    // A voice note is bytes-identical to any other audio upload, so the kind
    // comes from the message it hangs off, not from sniffing the MIME type.
    kind: attachmentKind(a.contentType, {
      voice: opts?.voice ?? a.waveform !== null,
    }),
    url: `/api/wpp/files/${a.id}`,
  };
}

/**
 * Drop an attachment's row and its object. Used when a profile photo or group
 * icon is replaced — otherwise every avatar change would leak a file into the
 * bucket forever.
 *
 * Best-effort and never throws into the request path: the row going away is
 * what users observe, and a stranded object is a housekeeping problem, not a
 * failed request.
 */
export async function deleteWaAttachment(id: string | null): Promise<void> {
  if (!id) return;
  try {
    const row = await prisma.waAttachment.findUnique({
      where: { id },
      select: { key: true },
    });
    if (!row) return;
    await prisma.waAttachment.delete({ where: { id } });

    // `key` is deliberately not unique — forwarding a photo creates another row
    // pointing at the same object instead of copying it. So the object may only
    // go when the last row referencing it does; deleting unconditionally would
    // break the forwarded copies sitting in other people's chats.
    const stillReferenced = await prisma.waAttachment.count({
      where: { key: row.key },
    });
    if (stillReferenced === 0) await getStorage().remove(row.key);
  } catch (err) {
    console.error("wpp: could not delete attachment", id, err);
  }
}

/**
 * Recover the attachment id from a stored profile-photo / group-icon URL.
 * Those columns hold the proxy path rather than an id so the client can render
 * them without a second lookup; this is the inverse, used when replacing one.
 */
export function attachmentIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^\/api\/wpp\/files\/([A-Za-z0-9_-]+)$/.exec(url);
  return m ? m[1] : null;
}

/** The public URL for an attachment — always our own authorizing proxy. */
export function waFileUrl(attachmentId: string): string {
  return `/api/wpp/files/${attachmentId}`;
}

/** The columns `serializeWaAttachment` needs — reuse in every Prisma select. */
export const waAttachmentSelect = {
  id: true,
  filename: true,
  contentType: true,
  size: true,
  width: true,
  height: true,
  durationMs: true,
  waveform: true,
} as const;
