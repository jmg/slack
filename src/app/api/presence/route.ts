import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, requireUser } from "@/lib/api";

/** Client heartbeat: refresh this user's lastSeenAt so others see them online. */
export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  });
}
