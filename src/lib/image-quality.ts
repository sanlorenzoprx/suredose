/*
 * Quick checks on a photo before it is sent for reading: is it sharp, lit well, and
 * free of washed-out glare? Pure functions on pixel data so they are unit-tested; the
 * browser code in image.ts feeds them a small copy of the photo.
 *
 * These only decide whether to ask the person to retake. They never decide what a
 * label says, and a photo that passes is still read (and can still be "unclear").
 */

export type PixelData = {
  data: ArrayLike<number>; // RGBA, 4 bytes per pixel
  width: number;
  height: number;
};

export type PhotoIssue = "blurry" | "dark" | "glare";

export type PhotoQuality = {
  /** Variance of the Laplacian on luma: higher = more fine detail. */
  sharpness: number;
  /** Mean luma, 0-255. */
  brightness: number;
  /** Share of pixels that are pure white (washed out), 0-1. */
  blownShare: number;
  issues: PhotoIssue[];
};

/** Calibrated on 640px-wide copies of real label photos (see image-quality.test.ts). */
export const THRESHOLDS = {
  /** Mild blur scores ~105+, blur that smears small print ~66 or less (640px-wide copies). */
  minSharpness: 80,
  minBrightness: 70,
  /** Clean white labels measure ~0%; a visible glare patch is well above this. */
  maxBlownShare: 0.08,
};

export function lumaPlane(img: PixelData): Float32Array {
  const { data, width, height } = img;
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i += 1, p += 4) {
    out[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }
  return out;
}

export function laplacianVariance(img: PixelData): number {
  const { width, height } = img;
  if (width < 3 || height < 3) return 0;
  const y = lumaPlane(img);
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let r = 1; r < height - 1; r += 1) {
    for (let c = 1; c < width - 1; c += 1) {
      const i = r * width + c;
      const lap = 4 * y[i] - y[i - 1] - y[i + 1] - y[i - width] - y[i + width];
      sum += lap;
      sumSq += lap * lap;
      n += 1;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function exposureStats(img: PixelData): { brightness: number; blownShare: number } {
  const y = lumaPlane(img);
  let total = 0;
  let blown = 0;
  for (let i = 0; i < y.length; i += 1) {
    total += y[i];
    if (y[i] >= 250) blown += 1;
  }
  return { brightness: total / y.length, blownShare: blown / y.length };
}

export function assessPhoto(img: PixelData): PhotoQuality {
  const sharpness = laplacianVariance(img);
  const { brightness, blownShare } = exposureStats(img);
  const issues: PhotoIssue[] = [];
  if (brightness < THRESHOLDS.minBrightness) issues.push("dark");
  if (blownShare > THRESHOLDS.maxBlownShare) issues.push("glare");
  // A dark photo has little contrast by nature; report the light problem first.
  if (!issues.includes("dark") && sharpness < THRESHOLDS.minSharpness) issues.push("blurry");
  return { sharpness, brightness, blownShare, issues };
}

export const ISSUE_MESSAGE: Record<PhotoIssue, string> = {
  blurry: "This photo looks blurry. Hold the phone steady, or rest it on the table, and try again.",
  dark: "This photo is dark. Move to a brighter spot or turn on a light, and try again.",
  glare: "There is a bright glare on the label. Tilt the bottle slightly to move it, and try again.",
};
