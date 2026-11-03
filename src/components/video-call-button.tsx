import { useState } from "react";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ringFamilyVideo } from "@/lib/care";
import { videoCallUrl } from "@/lib/video";

/** Opens the family's private video room and nudges the other phone. */
export function VideoCallButton({
  familyCode,
  myName,
  otherName,
}: {
  familyCode: string;
  myName: string;
  otherName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    try {
      const url = await videoCallUrl(familyCode, myName);
      // Open synchronously-after-await may be blocked on iOS; navigate this tab as a fallback.
      const win = window.open(url, "_blank", "noopener");
      if (!win) window.location.href = url;
      void ringFamilyVideo({ data: { code: familyCode, callerName: myName } }).catch(() => undefined);
    } catch {
      setError("Could not start the video call. Please try again.");
    } finally {
      setBusy(false);
    }
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
      {error ? <p className="mt-3 text-lg font-bold text-danger">{error}</p> : null}
    </section>
  );
}
