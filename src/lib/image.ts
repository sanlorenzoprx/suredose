import { centerCrop, PILL_GUIDE_SHARE } from "./image-crop";
import { assessPhoto, THRESHOLDS, type PhotoKind, type PhotoQuality } from "./image-quality";

/** Shrinking to 0x0 frees the bitmap memory right away (matters on older phones). */
function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

const MAX_EDGE = 720;
const QUALITY = 0.74;

export { PILL_GUIDE_SHARE };

export function compressImage(
  file: Blob,
  maxEdge = MAX_EDGE,
  quality = QUALITY,
  cropShare = 1,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { sx, sy, sw, sh } = centerCrop(img.width, img.height, cropShare);
      const scale = Math.min(1, maxEdge / Math.max(sw, sh));
      const w = Math.max(1, Math.round(sw * scale));
      const h = Math.max(1, Math.round(sh * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not read this photo."));
        return;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      const out = canvas.toDataURL("image/jpeg", quality);
      releaseCanvas(canvas); // phones keep canvas pixels alive otherwise
      img.src = "";
      resolve(out);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not open this photo."));
    };
    img.src = url;
  });
}

export function dataUrlFromCanvas(canvas: HTMLCanvasElement, quality = QUALITY): string {
  return canvas.toDataURL("image/jpeg", quality);
}

export async function toDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;
  const res = await fetch(src);
  if (!res.ok) throw new Error("Could not load this photo.");
  const blob = await res.blob();
  return compressImage(blob);
}

/** Pharmacy label print is small: keep enough detail for the AI to read it. */
export const LABEL_MAX_EDGE = 2048;
export const LABEL_QUALITY = 0.9;

export function captureFromVideo(
  video: HTMLVideoElement,
  maxEdge = MAX_EDGE,
  quality = QUALITY,
  cropShare = 1,
): string {
  const vw = video.videoWidth || 720;
  const vh = video.videoHeight || 720;
  const { sx, sy, sw, sh } = centerCrop(vw, vh, cropShare);
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not take this photo.");
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL("image/jpeg", quality);
  releaseCanvas(canvas);
  return out;
}

/** Re-encode any image data URL (e.g. an official pill photo) to the app's 720px JPEG. */
export async function shrinkDataUrl(
  dataUrl: string,
  maxEdge = MAX_EDGE,
  quality = QUALITY,
): Promise<string> {
  const res = await fetch(dataUrl);
  return compressImage(await res.blob(), maxEdge, quality);
}

/** Keep detail for imprint reading; no sharpening or generated pixels. */
export const PILL_MAX_EDGE = 1600;
export const PILL_QUALITY = 0.9;

type StillCapture = { takePhoto(): Promise<Blob> };
type StillCaptureConstructor = new (track: MediaStreamTrack) => StillCapture;

/**
 * One still from the camera at full quality. Prefers the camera's real still-photo mode
 * (full sensor resolution, proper autofocus and exposure) over a frame of the video
 * preview, which is smaller and more compressed.
 */
export async function grabStill(
  video: HTMLVideoElement,
  track: MediaStreamTrack,
  maxEdge: number,
  quality: number,
  cropShare = 1,
): Promise<string> {
  const Camera = (globalThis as typeof globalThis & { ImageCapture?: StillCaptureConstructor })
    .ImageCapture;
  if (Camera) {
    try {
      const blob = await new Camera(track).takePhoto();
      return await compressImage(blob, maxEdge, quality, cropShare);
    } catch {
      // Some Android browsers expose ImageCapture but cannot take a still.
    }
  }
  if (!video.videoWidth || !video.videoHeight) throw new Error("Camera is not ready. Try again.");
  return captureFromVideo(video, maxEdge, quality, cropShare);
}

export async function capturePillPhoto(
  video: HTMLVideoElement,
  track: MediaStreamTrack,
): Promise<string> {
  return grabStill(video, track, PILL_MAX_EDGE, PILL_QUALITY, PILL_GUIDE_SHARE);
}

const ASSESS_EDGE = 640;

/** Sharpness / light / glare of a photo, measured on a small copy. */
export function assessDataUrl(dataUrl: string, kind: PhotoKind = "label"): Promise<PhotoQuality> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, ASSESS_EDGE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        reject(new Error("Could not check this photo."));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const quality = assessPhoto(ctx.getImageData(0, 0, w, h), kind);
      releaseCanvas(canvas);
      img.src = "";
      resolve(quality);
    };
    img.onerror = () => reject(new Error("Could not check this photo."));
    img.src = dataUrl;
  });
}

/**
 * Take a few stills a moment apart and keep the sharpest, so a shaky instant does not
 * ruin the photo. Stops early once a shot is clearly sharp.
 */
export async function captureBest(
  video: HTMLVideoElement,
  track: MediaStreamTrack,
  maxEdge: number,
  quality: number,
  kind: PhotoKind,
  cropShare = 1,
  shots = 3,
): Promise<{ dataUrl: string; quality: PhotoQuality }> {
  let best: { dataUrl: string; quality: PhotoQuality } | null = null;
  for (let i = 0; i < shots; i += 1) {
    const dataUrl = await grabStill(video, track, maxEdge, quality, cropShare);
    const q = await assessDataUrl(dataUrl, kind).catch(() => null);
    if (!q)
      return (
        best ?? { dataUrl, quality: { sharpness: 0, brightness: 128, blownShare: 0, issues: [] } }
      );
    if (!best || q.sharpness > best.quality.sharpness) best = { dataUrl, quality: q };
    if (q.sharpness >= THRESHOLDS.minSharpness * 3 && q.issues.length === 0) break;
    if (i < shots - 1) await new Promise((r) => setTimeout(r, 150));
  }
  return best as { dataUrl: string; quality: PhotoQuality };
}
