import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { captureFromVideo, compressImage } from "@/lib/image";

type Props = {
  title: string;
  hint: string;
  onCapture: (dataUrl: string) => void;
  preview?: string | null;
  extraAction?: React.ReactNode;
};

export function PhotoCapture({ title, hint, onCapture, preview, extraAction }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => stopCamera();
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setError("Camera is not available here. Choose a photo from your phone instead.");
      setCameraOn(false);
    }
  }

  function snap() {
    const video = videoRef.current;
    if (!video) return;
    const data = captureFromVideo(video);
    stopCamera();
    onCapture(data);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const data = await compressImage(file);
      onCapture(data);
    } catch {
      setError("Could not open that photo. Try another one.");
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
            className="aspect-square w-full object-cover"
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
          <Button size="xl" onClick={snap}>
            <Camera className="size-7" />
            Take photo
          </Button>
          <Button size="xl" variant="secondary" onClick={stopCamera}>
            Cancel camera
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Button size="xl" onClick={() => void startCamera()}>
            <Camera className="size-7" />
            Open camera
          </Button>
          <Button size="xl" variant="secondary" onClick={() => inputRef.current?.click()}>
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
