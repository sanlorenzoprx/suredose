import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ringFamilyVideo } from "@/lib/care";

/** Rings the other phone, then opens the family's private video call. */
export function VideoCallButton({
  familyCode,
  myName,
  otherName,
}: {
  familyCode: string;
  myName: string;
  otherName: string;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    // The nudge is best-effort and must never delay or block the call itself.
    void ringFamilyVideo({ data: { code: familyCode, callerName: myName } }).catch(() => undefined);
    await navigate({ to: "/video" });
    setBusy(false);
  }

  return (
    <section className="rounded-xl bg-paper p-5 shadow-card">
      <h2 className="flex items-center gap-2 text-2xl font-bold">
        <Video className="size-6" />
        Video call
      </h2>
      <p className="mt-2 text-xl text-muted">
        See and talk with {otherName || "your family"}. They get a notification to join.
      </p>
      <Button size="xl" className="mt-4 w-full" disabled={busy} onClick={() => void start()}>
        <Video className="size-6" />
        {busy ? "Starting…" : `Call ${otherName || "family"}`}
      </Button>
    </section>
  );
}
