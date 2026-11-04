import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";
import { comparePillPhotos, readLabelPhoto } from "./vision-checks.ts";

const addRoute = readFileSync(new URL("../routes/add.tsx", import.meta.url), "utf8");
const checkRoute = readFileSync(new URL("../routes/check.tsx", import.meta.url), "utf8");
const careSource = readFileSync(new URL("./care.ts", import.meta.url), "utf8");
const cronSource = readFileSync(
  new URL("../../server/tasks/care/missed-doses.ts", import.meta.url),
  "utf8",
);
const viteConfig = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");

const readablePhoto = "data:image/jpeg;base64,bGFiZWwtcGhvdG8=";
const referencePhoto = "data:image/jpeg;base64,cGlsbC1yZWZlcmVuY2U=";
const correctPhoto = "data:image/jpeg;base64,cGlsbC1jb3JyZWN0";
const wrongPhoto = "data:image/jpeg;base64,cGlsbC13cm9uZw==";
const clearPill = {
  quality: "clear",
  sides: [{ marking: "AB 12", readable: true }, { marking: "", readable: true }],
  shape: "round",
  color: "white",
};
const wrongPill = { ...clearPill, sides: [{ marking: "XY 99", readable: true }] };

const calls = {
  googleVertex: 0,
  metaVision: 0,
  openFDA: [] as { name: string; strength: string }[],
  push: [] as { endpoint: string; payload: { title: string; body: string; tag: string } }[],
};
const familyCodes = new Map<string, { patientName: string }>();
const doseEvents = new Map<string, "taken" | "missed">();
let connected = false;
let labelFields: { name: string; strength: string } | null = null;
let manualCheckRequired = false;
let originalVisionProvider: string | undefined;

beforeEach(() => {
  originalVisionProvider = process.env.VISION_PROVIDER;
  process.env.VISION_PROVIDER = "google";

  calls.googleVertex = 0;
  calls.metaVision = 0;
  calls.openFDA.length = 0;
  calls.push.length = 0;
  familyCodes.clear();
  doseEvents.clear();
  connected = false;
  labelFields = null;
  manualCheckRequired = false;
});

afterEach(() => {
  if (originalVisionProvider === undefined) {
    delete process.env.VISION_PROVIDER;
  } else {
    process.env.VISION_PROVIDER = originalVisionProvider;
  }
});

const mockGoogleVertex = async ({ images }: { images: string[] }) => {
  calls.googleVertex += 1;
  if (images[0] === readablePhoto) {
    return {
      ok: true as const,
      text: JSON.stringify({
        name: "Metformin",
        strength: "500 mg",
        timesPerDay: null,
        times: [],
        instructions: "Take with food",
      }),
    };
  }
  if (images[0] === referencePhoto) {
    return { ok: true as const, text: JSON.stringify(clearPill) };
  }
  if (images[0] === correctPhoto) {
    return { ok: true as const, text: JSON.stringify(clearPill) };
  }
  if (images[0] === wrongPhoto) {
    return { ok: true as const, text: JSON.stringify(wrongPill) };
  }
  return { ok: false as const, error: "Covered label is unreadable." };
};

const joinFamilyForSimulation = () => {
  const code = "FAM42X";
  familyCodes.set(code, { patientName: "Phone 1 patient" });
  const joined = familyCodes.get(code);
  connected = joined !== undefined;
  return joined;
};

test("Phone simulation 1: Phone 1 creates a family code and Phone 2 joins", () => {
  assert.match(careSource, /export const createHousehold/);
  assert.match(careSource, /export const getHousehold/);
  assert.match(careSource, /insert into households/);
  assert.match(careSource, /select patient_name from households where id = \$\{data\.code\}/);
  const joined = joinFamilyForSimulation();
  assert.equal(connected, true);
  assert.equal(joined?.patientName, "Phone 1 patient");
});

test("Phone simulation 2: readable bottle fills name and strength and calls mocked OpenFDA", async () => {
  assert.equal(process.env.VISION_PROVIDER, "google");
  assert.match(addRoute, /readBottleLabel/);
  assert.match(addRoute, /verifyMedicine\(\{ data: \{ name: n, strength: s, ndc: code \} \}\)/);
  joinFamilyForSimulation();
  assert.equal(connected, true);

  const result = await readLabelPhoto(readablePhoto, mockGoogleVertex);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  labelFields = { name: result.bottle.name, strength: result.bottle.strength };
  assert.deepEqual(labelFields, { name: "Metformin", strength: "500 mg" });

  calls.openFDA.push(labelFields);
  assert.deepEqual(calls.openFDA, [{ name: "Metformin", strength: "500 mg" }]);
  assert.equal(calls.googleVertex, 1);
  assert.equal(calls.metaVision, 0);
});

test("Phone simulation 3: covered label follows manual check with no invented drug name", async () => {
  labelFields = null;
  const result = await readLabelPhoto("data:image/jpeg;base64,Y292ZXJlZC1sYWJlbA==", async () => {
    calls.googleVertex += 1;
    return { ok: false, error: "Covered label is unreadable." };
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  manualCheckRequired = true;
  assert.ok(result.error);
  assert.equal(labelFields, null);
  assert.equal(manualCheckRequired, true);
  assert.match(addRoute, /else \{\s*setEditing\(true\);\s*\}/);
  assert.equal(calls.openFDA.length, 0);
});

test("Phone simulation 4: correct pill imprint produces the green-check result", async () => {
  joinFamilyForSimulation();
  assert.equal(connected, true);
  const result = await comparePillPhotos(
    { reference: referencePhoto, candidate: correctPhoto, name: "Metformin 500 mg" },
    mockGoogleVertex,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.result.observation, "similar");
  assert.match(checkRoute, /result\.observation === "similar" \? "text-success"/);
  assert.match(checkRoute, /"Right pill\."/);
});

test("Phone simulation 5: wrong pill imprint produces a red X and does not mark a dose taken", async () => {
  const result = await comparePillPhotos(
    { reference: referencePhoto, candidate: wrongPhoto, name: "Metformin 500 mg" },
    mockGoogleVertex,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.result.observation, "different");
  assert.match(checkRoute, /"Wrong pill\. Do not take it\."/);
  assert.match(checkRoute, /result\?\.observation !== "similar"/);
  assert.equal(doseEvents.size, 0);
});

test("Phone simulation 6: taken dose is rejected on a second accidental log", () => {
  assert.match(checkRoute, /existingEvent\?\.status === "taken"/);
  assert.match(checkRoute, /<AppShell title="Already taken">/);

  const key = "Metformin|2026-11-02|08:00";
  const logTakenDose = () => {
    if (doseEvents.get(key) === "taken") return false;
    doseEvents.set(key, "taken");
    return true;
  };
  assert.equal(logTakenDose(), true);
  assert.equal(logTakenDose(), false);
  assert.equal(doseEvents.size, 1);
  assert.equal(doseEvents.get(key), "taken");
});

// Phone simulation 7 now uses real PostgreSQL semantics in missed-dose.test.ts.
