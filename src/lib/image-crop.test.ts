import assert from "node:assert/strict";
import { test } from "node:test";
import { centerCrop, PILL_GUIDE_SHARE } from "./image-crop.ts";

test("no crop keeps the whole picture", () => {
  assert.deepEqual(centerCrop(4000, 3000, 1), { sx: 0, sy: 0, sw: 4000, sh: 3000 });
});

test("the guide crop is a centered square of the short side", () => {
  const c = centerCrop(3840, 2160, PILL_GUIDE_SHARE);
  assert.equal(c.sw, c.sh);
  assert.equal(c.sh, Math.round(2160 * PILL_GUIDE_SHARE));
  assert.equal(c.sx, Math.round((3840 - c.sw) / 2));
  assert.equal(c.sy, Math.round((2160 - c.sh) / 2));
  const portrait = centerCrop(2160, 3840, PILL_GUIDE_SHARE);
  assert.equal(portrait.sw, Math.round(2160 * PILL_GUIDE_SHARE));
  assert.ok(portrait.sy > portrait.sx);
});

test("a tiny picture still crops to at least one pixel", () => {
  const c = centerCrop(1, 1, 0.55);
  assert.ok(c.sw >= 1 && c.sh >= 1);
});
