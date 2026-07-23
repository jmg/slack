import "server-only";
import { prisma } from "@/lib/prisma";

type AuditInput = {
  action: string;
  actorId?: string | null;
  workspaceId?: string | null;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
};

/**
 * Append an entry to the audit log. Fire-and-forget and best-effort: it never
 * throws into the request path, so a logging failure can't break the action it
 * was recording. `meta` is stored as a JSON string to keep the column simple.
 */
export function recordAudit(input: AuditInput): void {
  prisma.auditLog
    .create({
      data: {
        action: input.action,
        actorId: input.actorId ?? null,
        workspaceId: input.workspaceId ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        meta: input.meta ? JSON.stringify(input.meta) : null,
      },
    })
    .catch((err) => console.error("audit log write failed", err));
}
