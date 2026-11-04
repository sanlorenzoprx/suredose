import assert from "node:assert/strict";
import { test } from "node:test";
import { assessPhoto, laplacianVariance, THRESHOLDS, type PixelData } from "./image-quality.ts";

function make(width: number, height: number, pixel: (x: number, y: number) => number): PixelData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = pixel(x, y);
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

// Fine black-on-grey stripes stand in for sharp printed text; a gentle ramp for a blurred one.
const sharpText = make(120, 120, (x) => (Math.floor(x / 2) % 2 === 0 ? 70 : 200));
const blurred = make(120, 120, (x) => 120 + 20 * Math.sin(x / 15));

test("sharp detail scores far above a blurred copy", () => {
  assert.ok(laplacianVariance(sharpText) > THRESHOLDS.minSharpness * 5);
  assert.ok(laplacianVariance(blurred) < THRESHOLDS.minSharpness);
});

test("a sharp, evenly lit photo has no issues", () => {
  assert.deepEqual(assessPhoto(sharpText).issues, []);
});

test("a blurred photo is flagged blurry", () => {
  assert.deepEqual(assessPhoto(blurred).issues, ["blurry"]);
});

test("a dark photo is flagged dark, not also blurry", () => {
  const dark = make(120, 120, (x) => (Math.floor(x / 2) % 2 === 0 ? 10 : 40));
  assert.deepEqual(assessPhoto(dark).issues, ["dark"]);
});

test("a large washed-out patch is flagged as glare, but clean white paper is not", () => {
  const glare = make(120, 120, (x, y) => (x > 30 && x < 90 && y > 30 && y < 90 ? 255 : Math.floor(x / 2) % 2 ? 90 : 180));
  assert.ok(assessPhoto(glare).issues.includes("glare"));
  const paper = make(120, 120, (x) => (Math.floor(x / 2) % 2 === 0 ? 210 : 235));
  assert.ok(!assessPhoto(paper).issues.includes("glare"));
});

test("a tiny image never throws", () => {
  assert.equal(laplacianVariance(make(2, 2, () => 100)), 0);
});

test("a pill on a dark table is not called dark; only sharpness is judged for pills", () => {
  // Dark table with a small bright, detailed disc: typical pill photo.
  const pill = make(120, 120, (x, y) => {
    const inDisc = (x - 60) ** 2 + (y - 60) ** 2 < 20 ** 2;
    return inDisc ? (Math.floor(x / 2) % 2 === 0 ? 230 : 150) : 25;
  });
  assert.ok(assessPhoto(pill, "label").issues.includes("dark"));
  assert.deepEqual(assessPhoto(pill, "pill").issues, []);
  assert.deepEqual(assessPhoto(blurred, "pill").issues, ["blurry"]);
});
