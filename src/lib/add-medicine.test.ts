import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { medicineSaveError } from "./add-medicine.ts";

const addRoute = readFileSync(new URL("../routes/add.tsx", import.meta.url), "utf8");
const validFields = {
  name: "Metformin",
  strength: "500 mg",
  times: ["08:00"],
  scheduleConfirmed: true,
};

test("saving with no official image uses the confirmed medicine and own pill photo path", () => {
  const check = { status: "verified", medicine: { ...validFields, officialImage: null } };
  assert.equal(check.medicine.officialImage, null);
  assert.equal(medicineSaveError(validFields), null);
  assert.match(addRoute, /No official photo found — we&apos;ll use your pill photo\./);
  assert.match(addRoute, /save\(pillImage, "own"\)/);
  assert.match(addRoute, /Put one pill on a dark table/);
  assert.match(addRoute, /check && check\.status !== "verified"/);
  assert.match(addRoute, /onClick=\{\(\) => acceptMedicine\(null\)\}/);
});

test("saving after image lookup errors is not gated by lookup status", async () => {
  const lookup = async () => {
    throw new Error("Image lookup unavailable");
  };
  await assert.rejects(lookup(), /Image\s+lookup\s+unavailable/);
  assert.equal(medicineSaveError(validFields), null);
  const saveBody = addRoute.match(/async function save\([\s\S]*?\n\s{2}\}/)?.[0] ?? "";
  assert.match(saveBody, /medicineSaveError/);
  assert.doesNotMatch(saveBody, /officialImage|check\?\.status/);
});

test("missing required fields return a visible, specific save reason", () => {
  assert.equal(
    medicineSaveError({ ...validFields, name: " " }),
    "Enter the medicine name before saving.",
  );
  assert.equal(
    medicineSaveError({ ...validFields, strength: "" }),
    "Enter the medicine strength before saving.",
  );
  assert.equal(
    medicineSaveError({ ...validFields, times: [] }),
    "Choose at least one reminder time before saving.",
  );
  assert.equal(
    medicineSaveError({ ...validFields, scheduleConfirmed: false }),
    "Confirm the reminder time before saving.",
  );
  assert.match(addRoute, /aria-live="polite"/);
  assert.match(addRoute, /role="alert"/);
});
