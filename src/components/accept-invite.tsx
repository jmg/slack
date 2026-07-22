"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AcceptInvite({
  token,
  workspaceName,
}: {
  token: string;
  workspaceName: string;
}) {
  const router = useRouter();
  const [joining, setJoining] = useState(false);

  async function join() {
    setJoining(true);
    try {
      const res = await fetch(`/api/invites/${token}/accept`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not join");
      router.push(`/w/${data.workspaceId}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join");
      setJoining(false);
    }
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">You&apos;ve been invited to join</p>
      <h1 className="mt-1 text-2xl font-bold">{workspaceName}</h1>
      <Button onClick={join} disabled={joining} className="mt-6 w-full">
        {joining ? "Joining…" : "Join workspace"}
      </Button>
    </>
  );
}
