import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getStorage } from "@/lib/storage";
import { requireWaUser } from "@/lib/wpp/api";
import { requireCanSend } from "@/lib/wpp/data";
import { serializeWaAttachment } from "@/lib/wpp/uploads";
import {
  MAX_WPP_AVATAR_BYTES,
  encodeWaveform,
  extensionOf,
  maxBytesFor,
  sanitizeFilename,
} from "@/lib/wpp/upload-limits";
import type { WaAttachmentPurpose } from "@/generated/prisma/enums";

const PURPOSES = ["MESSAGE", "AVATAR", "GROUP_ICON", "STATUS"] as const;

function purposeOf(value: FormDataEntryValue | null): WaAttachmentPurpose | null {
  if (value == null) return "MESSAGE";
  if (typeof value !== "string") return null;
  return (PURPOSES as readonly string[]).includes(value)
    ? (value as WaAttachmentPurpose)
    : null;
}

/** Optional positive integer from a form field, clamped to something sane. */
function clampedInt(
  value: FormDataEntryValue | null,
  max: number,
): number | null {
  if (typeof value !== "string") return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, max);
}

/**
 * Upload a file and get back a *pending* attachment.
 *
 * Phase one of the two-phase upload: the row lands with `messageId: null` and
 * carries no meaning until something claims it — a message send
 * (`claimWaAttachments`), a profile save, or a status post. That is also the
 * authorization boundary, so the only thing this handler has to decide is
 * whether the caller may put bytes in the bucket at all.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    assertSameOrigin(req);
    const me = await requireWaUser();

    // Bytes are the expensive resource here, so the ceiling is much lower than
    // the message-send limit.
    const limited = rateLimit(`wpp:upload:${me.id}:${clientIp(req)}`, 40, 5 * 60 * 1000);
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "error.rateLimited" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
      );
    }

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File)) return apiError("validate.invalidInput");
    if (file.size === 0) return apiError("validate.invalidInput");

    const purpose = purposeOf(form.get("purpose"));
    if (!purpose) return apiError("validate.invalidInput");

    // Message media is scoped to a chat, and you may only put a file in a chat
    // you could send to — otherwise the upload would be a way to plant bytes in
    // a conversation you've been blocked from or removed from.
    const chatIdField = form.get("chatId");
    const chatId =
      purpose === "MESSAGE" && typeof chatIdField === "string" && chatIdField
        ? chatIdField
        : null;
    if (chatId) await requireCanSend(me.id, chatId);

    const filename = sanitizeFilename(file.name || "file");
    const contentType = (file.type || "application/octet-stream")
      .toLowerCase()
      .slice(0, 150);

    // Profile photos and group icons are rendered everywhere and shouldn't need
    // the media budget; everything else is sized by what it is.
    const limit =
      purpose === "AVATAR" || purpose === "GROUP_ICON"
        ? MAX_WPP_AVATAR_BYTES
        : maxBytesFor(contentType);
    if (file.size > limit) return apiError("error.tooLarge", 413);

    // The key is ours alone: a uuid under a scope we derive, never anything the
    // caller supplied. The original name lives in `filename`.
    const scope = chatId ? `c/${chatId}` : `u/${me.id}`;
    const key = `wa/${scope}/${crypto.randomUUID()}${extensionOf(filename)}`;

    const bytes = await file.arrayBuffer();
    await getStorage().put(key, bytes, contentType);

    const waveformField = form.get("waveform");
    const waveform =
      typeof waveformField === "string" && waveformField
        ? encodeWaveform(
            waveformField
              .split(",")
              .map((v) => Number.parseInt(v, 10))
              .filter((v) => Number.isFinite(v)),
          )
        : null;

    const attachment = await prisma.waAttachment.create({
      data: {
        key,
        filename,
        contentType,
        size: bytes.byteLength,
        width: clampedInt(form.get("width"), 20000),
        height: clampedInt(form.get("height"), 20000),
        durationMs: clampedInt(form.get("durationMs"), 24 * 60 * 60 * 1000),
        waveform,
        purpose,
        chatId,
        uploaderId: me.id,
      },
    });

    // A recording is bytes-identical to any other audio file, so whether this is
    // a voice note is something the composer states rather than we sniff.
    const voice = form.get("voice") === "1";
    return NextResponse.json(serializeWaAttachment(attachment, { voice }));
  });
}
