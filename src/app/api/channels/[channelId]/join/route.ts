import { NextRequest, NextResponse } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { joinChannel } from "@/lib/data";
import { assertSameOrigin } from "@/lib/csrf";

/**
 * Join a public channel (self-service), Slack-style: you can read a public
 * channel by browsing to it, but must join before posting. Idempotent.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ channelId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const { channelId } = await params;
    const channel = await joinChannel(user.id, channelId);
    return NextResponse.json({ id: channel.id, joined: true });
  });
}
