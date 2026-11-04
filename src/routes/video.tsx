import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getVideoToken } from "@/lib/care";
import { useAppStore } from "@/lib/store";
import { videoCallUrl } from "@/lib/video";

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
  const [phase, setPhase] = useState<"starting" | "live" | "backup">("starting");
  const [backupUrl, setBackupUrl] = useState("");
  /** Short code for why the in-app call did not start, shown small so a failure can be diagnosed. */
  const [why, setWhy] = useState("");

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

      const backup = async (reason: string) => {
        setWhy(reason);
        setBackupUrl(await videoCallUrl(code, myName));
        if (!cancelled) setPhase("backup");
      };

      try {
        const res = await getVideoToken({ data: { code, userId, userName: myName } });
        if (!res.ok) return await backup(res.reason);
        let Zego: ZegoStatic;
        try {
          Zego = await loadZego();
        } catch {
          return await backup("script-load");
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
        } catch (err) {
          return await backup(`join-${err instanceof Error ? err.name : "error"}`);
        }
        setPhase("live");
      } catch {
        await backup("token-request-failed");
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
    // Start once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      {phase === "backup" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black px-6 text-center">
          <p className="text-2xl font-bold">The in-app video call is not available right now.</p>
          <p className="text-xl text-white/80">You can use the backup video call instead.</p>
          <Button size="xl" onClick={() => window.location.assign(backupUrl)}>
            Open the backup video call
          </Button>
          {why ? <p className="text-sm text-white/40">Reason: {why}</p> : null}
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
