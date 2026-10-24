import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  captureFromVideo,
  capturePillPhoto,
  compressImage,
  PILL_MAX_EDGE,
  PILL_QUALITY,
} from "@/lib/image";

type Props = {
  title: string;
  hint: string;
  onCapture: (dataUrl: string) => void;
  preview?: string | null;
  extraAction?: React.ReactNode;
  pillDetail?: boolean;
};

export function PhotoCapture({
  title,
  hint,
  onCapture,
  preview,
  extraAction,
  pillDetail = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!cameraOn || !videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    void video.play().catch(() => {
      setError("Could not start the camera. Try again.");
      stopCamera();
    });
  }, [cameraOn]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    setCameraReady(false);
  }

  async function startCamera() {
    setError(null);
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: pillDetail ? 1920 : 1280 },
          height: { ideal: pillDetail ? 1080 : 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      // Request autofocus only when the device advertises it. Unsupported controls are optional.
      const capabilities = track.getCapabilities?.() as MediaTrackCapabilities & {
        focusMode?: string[];
      };
      if (capabilities?.focusMode?.includes("continuous")) {
        await track
          .applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] })
          .catch(() => {});
      }
      setCameraOn(true);
    } catch {
      setError("Camera is not available here. Choose a photo from your phone instead.");
      stopCamera();
    } finally {
      setBusy(false);
    }
  }

  async function snap() {
    const video = videoRef.current;
    if (!video) return;
    setBusy(true);
    setError(null);
    try {
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track) throw new Error("Camera is not ready. Try again.");
      const data = pillDetail ? await capturePillPhoto(video, track) : captureFromVideo(video);
      stopCamera();
      onCapture(data);
    } catch {
      setError("Could not take the photo. Hold still and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = pillDetail
        ? await compressImage(file, PILL_MAX_EDGE, PILL_QUALITY)
        : await compressImage(file);
      onCapture(data);
    } catch {
      setError("Could not open that photo. Try another one.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-3xl font-bold leading-tight">{title}</h2>
        <p className="mt-2 text-xl text-muted">{hint}</p>
      </div>

      <div className="overflow-hidden rounded-xl bg-ink shadow-card">
        {cameraOn ? (
          <video
            ref={videoRef}
            className="aspect-square w-full object-contain"
            onLoadedData={() => setCameraReady(true)}
            playsInline
            muted
            autoPlay
          />
        ) : preview ? (
          <img src={preview} alt="Photo you took" className="aspect-square w-full object-cover" />
        ) : (
          <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 bg-ink text-due-fg">
            <Camera className="size-12" strokeWidth={2} />
            <p className="px-6 text-center text-xl">No photo yet</p>
          </div>
        )}
      </div>

      {error ? <p className="text-xl font-bold text-danger">{error}</p> : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.currentTarget.value = "";
        }}
      />

      {cameraOn ? (
        <div className="flex flex-col gap-3">
          <Button size="xl" disabled={busy || !cameraReady} onClick={() => void snap()}>
            <Camera className="size-7" />
            {busy ? "Taking photo…" : "Take photo"}
          </Button>
          <Button size="xl" variant="secondary" onClick={stopCamera}>
            Cancel camera
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Button size="xl" disabled={busy} onClick={() => void startCamera()}>
            <Camera className="size-7" />
            Open camera
          </Button>
          <Button
            size="xl"
            disabled={busy}
            variant="secondary"
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="size-7" />
            Choose a photo
          </Button>
          {preview ? (
            <Button size="xl" variant="ghost" onClick={() => inputRef.current?.click()}>
              <RefreshCw className="size-6" />
              Use a different photo
            </Button>
          ) : null}
          {extraAction}
        </div>
      )}
    </div>
  );
}
