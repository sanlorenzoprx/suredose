import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getVideoToken } from "@/lib/care";
import { useAppStore } from "@/lib/store";

export const Route = createFileRoute("/video")({ component: VideoPage });

// ZEGOCLOUD's call screen, served from our own domain (pinned copy, see public/vendor/zego).
const ZEGO_SCRIPT = "/vendor/zego/zego-uikit-prebuilt-2.18.5.js";

type ZegoInstance = { joinRoom(config: Record<string, unknown>): void; destroy(): void };
type ZegoStatic = {
  GroupCall: unknown;
  generateKitTokenForProduction(
    appId: number,
    token: string,
    roomId: string,
    userId: string,
    userName?: string,
  ): string;
  create(kitToken: string): ZegoInstance;
};

function zego(): ZegoStatic | undefined {
  return (window as unknown as { ZegoUIKitPrebuilt?: ZegoStatic }).ZegoUIKitPrebuilt;
}

function loadZego(): Promise<ZegoStatic> {
  return new Promise((resolve, reject) => {
    const ready = zego();
    if (ready) return resolve(ready);
    const script = document.createElement("script");
    script.src = ZEGO_SCRIPT;
    script.async = true;
    script.onload = () => {
      const loaded = zego();
      if (loaded) resolve(loaded);
      else reject(new Error("call screen missing"));
    };
    script.onerror = () => reject(new Error("call screen failed to load"));
    document.head.appendChild(script);
  });
}

function VideoPage() {
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"starting" | "live" | "unavailable">("starting");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let instance: ZegoInstance | undefined;
    let cancelled = false;

    async function start() {
      const store = useAppStore.getState();
      const { settings } = store;
      const code = settings.householdCode;
      if (!code) {
        await navigate({ to: "/family" });
        return;
      }
      const isCaregiver = settings.role === "caregiver";
      const userId = isCaregiver ? store.ensureCaregiverDeviceId() : store.ensureDeviceId();
      const myName =
        (isCaregiver ? settings.caregiverName : settings.patientName).trim() || "Family";

      const unavailable = () => {
        if (!cancelled) setPhase("unavailable");
      };
      if (!cancelled) setPhase("starting");

      try {
        const res = await getVideoToken({ data: { code, userId, userName: myName } });
        if (!res.ok) return unavailable();
        let Zego: ZegoStatic;
        try {
          Zego = await loadZego();
        } catch {
          return unavailable();
        }
        if (cancelled || !container.current) return;
        try {
          const kit = Zego.generateKitTokenForProduction(
            res.appId,
            res.token,
            res.roomId,
            res.userId,
            myName,
          );
          instance = Zego.create(kit);
          instance.joinRoom({
            container: container.current,
            scenario: { mode: Zego.GroupCall },
            maxUsers: 4,
            showPreJoinView: false,
            showLeavingView: false,
            turnOnMicrophoneWhenJoining: true,
            turnOnCameraWhenJoining: true,
            showScreenSharingButton: false,
            showTextChat: false,
            showUserList: false,
            showLayoutButton: false,
            onLeaveRoom: () => void navigate({ to: "/family" }),
          });
        } catch {
          try {
            instance?.destroy();
          } catch {
            /* already closed */
          }
          return unavailable();
        }
        setPhase("live");
      } catch {
        unavailable();
      }
    }

    void start();
    return () => {
      cancelled = true;
      try {
        instance?.destroy();
      } catch {
        /* already closed */
      }
    };
  }, [attempt, navigate]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div ref={container} className="min-h-0 flex-1" />
      {phase === "starting" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black">
          <Loader2 className="size-12 animate-spin" />
          <p className="text-2xl font-bold">Starting the video call…</p>
          <p className="text-xl text-white/70">Allow the camera and microphone if asked.</p>
        </div>
      ) : null}
      {phase === "unavailable" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-paper px-6 text-center text-ink">
          <p className="text-2xl font-bold">The in-app video call is not available right now.</p>
          <p className="text-xl text-muted">Try again, or return to Family and call later.</p>
          <Button size="xl" onClick={() => setAttempt((current) => current + 1)}>
            Try video call again
          </Button>
        </div>
      ) : null}
      {/* Always reachable, so a call that never connects can never trap the person. */}
      <div className="absolute left-4 top-4 z-10">
        <Button variant="secondary" onClick={() => void navigate({ to: "/family" })}>
          <ArrowLeft className="size-6" />
          {phase === "live" ? "Leave call" : "Back"}
        </Button>
      </div>
    </div>
  );
}
