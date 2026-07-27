import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * The workspace's active (non-revoked, non-expired) invite link, creating one if
 * none exists. Shared by the invites route and the "invite by email" flow so
 * they always hand out the same reusable token.
 */
export async function getOrCreateInvite(workspaceId: string, createdById: string) {
  const now = new Date();
  const existing = await prisma.invite.findFirst({
    where: { workspaceId, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  return prisma.invite.create({
    data: {
      workspaceId,
      token: randomBytes(18).toString("base64url"),
      createdById,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    },
  });
}

/**
 * Absolute base URL for links we put in emails. Prefers APP_BASE_URL (set in
 * prod), else the current request's origin, else the public hostname.
 */
export function appBaseUrl(req?: Request): string {
  const env = process.env.APP_BASE_URL;
  if (env) return env.replace(/\/+$/, "");
  if (req) {
    try {
      const u = new URL(req.url);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* fall through */
    }
  }
  return "https://slack.devcloudsoftware.com";
}
