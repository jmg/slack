import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, handle, requireUser } from "@/lib/api";
import { autoJoinDefaultChannels, requireWorkspaceMember } from "@/lib/data";
import { canAddMember } from "@/lib/billing";
import { FREE_MEMBER_LIMIT } from "@/lib/plans";
import { isOnline } from "@/lib/mentions";
import { addWorkspaceMemberSchema } from "@/lib/validators";
import { assertSameOrigin } from "@/lib/csrf";
import { recordAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { appBaseUrl, getOrCreateInvite } from "@/lib/invites";
import { BRAND } from "@/lib/brand";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { workspaceId } = await params;
    await requireWorkspaceMember(user.id, workspaceId);

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      orderBy: { user: { name: "asc" } },
      select: {
        role: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            lastSeenAt: true,
          },
        },
      },
    });

    return NextResponse.json(
      members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        role: m.role,
        isMe: m.user.id === user.id,
        online: isOnline(m.user.lastSeenAt),
      })),
    );
  });
}

/**
 * Invite someone to the workspace by email (admin only). If they already have an
 * account we add them straight away and email a heads-up; if not, we email them
 * the workspace invite link so they can sign up and join — the admin never has
 * to copy/paste a link manually. Email delivery is best-effort: when SendGrid is
 * unconfigured or fails we still return the invite token so the client can fall
 * back to sharing the link.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const { workspaceId } = await params;
    const membership = await requireWorkspaceMember(user.id, workspaceId);
    if (membership.role !== "ADMIN") {
      return apiError("Only a workspace admin can add people", 403);
    }
    if (!(await canAddMember(workspaceId))) {
      return apiError(
        `The Free plan is limited to ${FREE_MEMBER_LIMIT} members. Upgrade to Team in Settings to add more.`,
        402,
      );
    }

    const json = await req.json().catch(() => null);
    const parsed = addWorkspaceMemberSchema.safeParse(json);
    if (!parsed.success) {
      return apiError(parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { email } = parsed.data;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });
    const workspaceName = workspace?.name ?? "the workspace";
    const base = appBaseUrl(req);
    const inviter = user.name;

    const target = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, image: true },
    });

    if (!target) {
      // No account yet: email them the invite link (opening it walks them
      // through sign-up and then joins them to the workspace).
      const invite = await getOrCreateInvite(workspaceId, user.id);
      const url = `${base}/invite/${invite.token}`;
      const emailed = await sendEmail({
        to: email,
        subject: `${inviter} invited you to ${workspaceName} on ${BRAND}`,
        text: `${inviter} invited you to join the "${workspaceName}" workspace.\n\nCreate your account and join here:\n${url}\n\nThis link expires in 7 days.`,
        html: inviteEmailHtml({ inviter, workspaceName, url, cta: "Join the workspace" }),
      }).catch(() => false);
      return NextResponse.json({ invited: true, email, emailed, token: invite.token });
    }

    const existing = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: target.id } },
    });
    if (existing) {
      return apiError(`${target.name} is already in this workspace`, 409);
    }

    await prisma.workspaceMember.create({
      data: { workspaceId, userId: target.id, role: "MEMBER" },
    });
    await autoJoinDefaultChannels(target.id, workspaceId);
    recordAudit({
      action: "workspace.member_add",
      actorId: user.id,
      workspaceId,
      targetType: "user",
      targetId: target.id,
    });

    // Best-effort heads-up so they know they've been added.
    const url = `${base}/w/${workspaceId}`;
    const emailed = await sendEmail({
      to: target.email,
      subject: `${inviter} added you to ${workspaceName} on ${BRAND}`,
      text: `${inviter} added you to the "${workspaceName}" workspace.\n\nOpen it here:\n${url}`,
      html: inviteEmailHtml({ inviter, workspaceName, url, cta: "Open the workspace" }),
    }).catch(() => false);

    return NextResponse.json({
      id: target.id,
      name: target.name,
      email: target.email,
      image: target.image,
      emailed,
    });
  });
}

function inviteEmailHtml(o: {
  inviter: string;
  workspaceName: string;
  url: string;
  cta: string;
}): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1d1c1d">
    <h2 style="font-size:20px;margin:0 0 8px">Join <strong>${esc(o.workspaceName)}</strong></h2>
    <p style="font-size:15px;line-height:1.5;color:#454245;margin:0 0 20px">
      <strong>${esc(o.inviter)}</strong> invited you to the <strong>${esc(o.workspaceName)}</strong> workspace.
    </p>
    <p style="margin:0 0 24px">
      <a href="${esc(o.url)}" style="display:inline-block;background:#4A154B;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">${esc(o.cta)}</a>
    </p>
    <p style="font-size:13px;color:#616061;margin:0">Or paste this link into your browser:<br>
      <a href="${esc(o.url)}" style="color:#1264a3;word-break:break-all">${esc(o.url)}</a>
    </p>
  </div>`;
}
