/*
 * Pure geometry for cropping a photo to the pill guide box (no browser APIs, so it is unit-tested).
 */

/**
 * Share of the picture's short side kept when the camera crops to the pill guide box.
 * Cropping the full-resolution still BEFORE shrinking puts far more pixels on a small pill.
 */
export const PILL_GUIDE_SHARE = 0.55;

/** Source rectangle for a centered square crop (fraction of the short side), or the whole image. */
export function centerCrop(width: number, height: number, share: number) {
  if (share >= 1) return { sx: 0, sy: 0, sw: width, sh: height };
  const side = Math.max(1, Math.round(Math.min(width, height) * share));
  return {
    sx: Math.round((width - side) / 2),
    sy: Math.round((height - side) / 2),
    sw: side,
    sh: side,
  };
}
