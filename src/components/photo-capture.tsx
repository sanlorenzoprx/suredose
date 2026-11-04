import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, ImagePlus, RefreshCw, TriangleAlert, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  assessDataUrl,
  captureBest,
  captureFromVideo,
  compressImage,
  LABEL_MAX_EDGE,
  LABEL_QUALITY,
  PILL_MAX_EDGE,
  PILL_QUALITY,
} from "@/lib/image";
import { ISSUE_MESSAGE, type PhotoIssue } from "@/lib/image-quality";
import { readPhotoInput } from "@/lib/photo-input";

type Props = {
  title: string;
  hint: string;
  onCapture: (dataUrl: string) => void;
  preview?: string | null;
  extraAction?: React.ReactNode;
  pillDetail?: boolean;
  /** Bottle label photo: keep high detail so small print stays readable. */
  labelDetail?: boolean;
};

export function PhotoCapture({
  title,
  hint,
  onCapture,
  preview,
  extraAction,
  pillDetail = false,
  labelDetail = false,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraFallback, setCameraFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A photo that looks blurry, dark or glary: the person chooses to retake or use it. */
  const [pending, setPending] = useState<{ dataUrl: string; issues: PhotoIssue[] } | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const detailed = pillDetail || labelDetail;
  /** Only bottle labels get a "retake?" warning; pills sit on a dark table by design. */
  const gated = labelDetail && !pillDetail;

  /** Send a photo on, unless it looks poor and the person should decide first. */
  async function deliver(dataUrl: string, issues: PhotoIssue[]) {
    if (gated && issues.length > 0) {
      setPending({ dataUrl, issues });
      return;
    }
    setPending(null);
    onCapture(dataUrl);
  }

  function openFilePicker(inputId: "camera-photo-input" | "gallery-photo-input") {
    document.getElementById(inputId)?.click();
  }

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
    setTorchAvailable(false);
    setTorchOn(false);
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }

  async function startCamera() {
    setError(null);
    setCameraFallback(false);
    setBusy(true);
    try {
      const openStream = () =>
        navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: detailed ? 3840 : 1280 },
            height: { ideal: detailed ? 2160 : 720 },
          },
          audio: false,
        });
      // Right after another camera view closes, some phones still hold the camera for a moment.
      // Wait briefly and try once more before giving up.
      const stream = await openStream().catch(async () => {
        await new Promise((resolve) => setTimeout(resolve, 700));
        return openStream();
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
      setTorchAvailable(Boolean((capabilities as { torch?: boolean } | undefined)?.torch));
      setCameraOn(true);
    } catch {
      setError("Camera is not available here. Choose a photo from your phone instead.");
      setCameraFallback(true);
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
      const shot = detailed
        ? await captureBest(
            video,
            track,
            pillDetail ? PILL_MAX_EDGE : LABEL_MAX_EDGE,
            pillDetail ? PILL_QUALITY : LABEL_QUALITY,
            pillDetail ? "pill" : "label",
          )
        : { dataUrl: captureFromVideo(video), quality: { issues: [] as PhotoIssue[] } };
      stopCamera();
      await deliver(shot.dataUrl, shot.quality.issues);
    } catch {
      setError("Could not take the photo. Hold still and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    if (busy) {
      input.value = "";
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await readPhotoInput(
        input,
        (file) =>
          pillDetail
            ? compressImage(file, PILL_MAX_EDGE, PILL_QUALITY)
            : labelDetail
              ? compressImage(file, LABEL_MAX_EDGE, LABEL_QUALITY)
              : compressImage(file),
        async (data) => {
          setCameraFallback(false);
          const issues = gated ? await assessDataUrl(data, "label").then((q) => q.issues).catch(() => []) : [];
          await deliver(data, issues);
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that photo. Try another one.");
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

      {pending ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-bg-warm p-4 text-xl font-bold">
          <TriangleAlert className="mt-1 size-6 shrink-0" />
          {pending.issues.map((i) => ISSUE_MESSAGE[i]).join(" ")}
        </p>
      ) : null}

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
        ) : pending ?? preview ? (
          <img
            src={pending?.dataUrl ?? preview ?? ""}
            alt="Photo you took"
            className="aspect-square w-full object-cover"
          />
        ) : (
          <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 bg-ink text-due-fg">
            <Camera className="size-12" strokeWidth={2} />
            <p className="px-6 text-center text-xl">No photo yet</p>
          </div>
        )}
      </div>

      {error ? <p className="text-xl font-bold text-danger">{error}</p> : null}

      <input
        id="camera-photo-input"
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => void onFileSelection(event)}
      />
      <input
        id="gallery-photo-input"
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => void onFileSelection(event)}
      />

      {pending ? (
        <div className="flex flex-col gap-3">
          <Button size="xl" onClick={() => setPending(null)}>
            <RefreshCw className="size-7" />
            Retake the photo
          </Button>
          <Button
            size="xl"
            variant="secondary"
            onClick={() => {
              const photo = pending.dataUrl;
              setPending(null);
              onCapture(photo);
            }}
          >
            Use this photo anyway
          </Button>
        </div>
      ) : cameraOn ? (
        <div className="flex flex-col gap-3">
          {torchAvailable ? (
            <Button size="lg" variant="secondary" onClick={() => void toggleTorch()}>
              <Zap className="size-6" />
              {torchOn ? "Turn the light off" : "Turn the light on"}
            </Button>
          ) : null}
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
            onClick={() => openFilePicker("gallery-photo-input")}
          >
            <ImagePlus className="size-7" />
            Choose from gallery
          </Button>
          {cameraFallback ? (
            <Button
              size="xl"
              disabled={busy}
              variant="secondary"
              onClick={() => openFilePicker("camera-photo-input")}
            >
              <Camera className="size-7" />
              Use phone camera
            </Button>
          ) : null}
          {preview ? (
            <Button
              size="xl"
              variant="ghost"
              disabled={busy}
              onClick={() => openFilePicker("gallery-photo-input")}
            >
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
