const MAX_EDGE = 720;
const QUALITY = 0.74;

export function compressImage(file: Blob, maxEdge = MAX_EDGE, quality = QUALITY): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not read this photo."));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
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

export function captureFromVideo(video: HTMLVideoElement): string {
  const canvas = document.createElement("canvas");
  const w = video.videoWidth || 720;
  const h = video.videoHeight || 720;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not take this photo.");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", QUALITY);
}

/** Re-encode any image data URL (e.g. an official pill photo) to the app's 720px JPEG. */
export async function shrinkDataUrl(dataUrl: string): Promise<string> {
  const res = await fetch(dataUrl);
  return compressImage(await res.blob());
}
