import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { requireWorkspaceMember } from "@/lib/data";
import { getStorage, objectKeyFor } from "@/lib/storage";
import { serializeAttachment } from "@/lib/uploads";
import {
  MAX_FILE_BYTES,
  extensionOf,
  formatBytes,
  sanitizeFilename,
} from "@/lib/upload-limits";

/** Optional positive integer from a form field, clamped to something sane. */
function dimension(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 20000) return null;
  return n;
}

/**
 * Upload a file and get back a *pending* attachment. It carries no message yet —
 * the composer holds the id and the message that is sent claims it.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { workspaceId } = await params;
    await requireWorkspaceMember(user.id, workspaceId);

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File)) {
      return apiError("No file uploaded");
    }
    if (file.size === 0) return apiError("That file is empty");
    if (file.size > MAX_FILE_BYTES) {
      return apiError(`Files must be under ${formatBytes(MAX_FILE_BYTES)}`, 413);
    }

    const filename = sanitizeFilename(file.name || "file");
    const contentType = (file.type || "application/octet-stream")
      .toLowerCase()
      .slice(0, 150);
    const key = objectKeyFor(workspaceId, extensionOf(filename));
    const bytes = await file.arrayBuffer();

    await getStorage().put(key, bytes, contentType);

    const attachment = await prisma.attachment.create({
      data: {
        key,
        filename,
        contentType,
        size: bytes.byteLength,
        width: dimension(form.get("width")),
        height: dimension(form.get("height")),
        workspaceId,
        uploaderId: user.id,
      },
    });

    return NextResponse.json(serializeAttachment(attachment));
  });
}
