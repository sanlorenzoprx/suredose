import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";
import { createServer, type Plugin } from "vite";
import { comparePillPhotos, readLabelPhoto } from "./vision-checks.ts";
import { GRACE_MS, todayISO } from "./schedule.ts";

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
  sides: [{ marking: "AB 12", readable: true }],
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
  assert.match(addRoute, /else setEditing\(true\)/);
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

test("Phone simulation 7: cron marks a dose missed after 2h15m and captures one caregiver push", async () => {
  assert.match(
    viteConfig,
    /scheduledTasks:\s*\{\s*"\*\/15 \* \* \* \*":\s*\["care:missed-doses"\]/,
  );
  assert.match(cronSource, /now\.getTime\(\) - scheduledAt\.getTime\(\) < GRACE_MS/);
  assert.match(cronSource, /row\.status === "taken"/);
  assert.match(cronSource, /sendPushToHousehold/);
  assert.match(cronSource, /notified = true/);

  const scheduledAt = new Date(2026, 10, 2, 8, 0);
  const mockedNow = new Date(scheduledAt.getTime() + 2 * 60 * 60 * 1000 + 15 * 60 * 1000);
  assert.equal(todayISO(mockedNow), "2026-11-02");
  assert.equal(mockedNow.getTime() - scheduledAt.getTime(), 2 * 60 * 60 * 1000 + 15 * 60 * 1000);

  const root = new URL("../../", import.meta.url).pathname;
  const plugin: Plugin = {
    name: "phone-simulation-external-mocks",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer?.endsWith("/server/tasks/care/missed-doses.ts")) return;
      if (source === "../../../src/lib/db") return "\0phone-simulation-db";
      if (source === "../../../src/lib/push.server") return "\0phone-simulation-push";
      if (source === "nitro/task") return "\0phone-simulation-nitro-task";
      return;
    },
    load(id) {
      if (id === "\0phone-simulation-db") {
        return "export async function getSql() { return globalThis.__phoneSimulationSql; }";
      }
      if (id === "\0phone-simulation-push") {
        return [
          "export async function sendPushToHousehold(code, payload) {",
          "  globalThis.__phoneSimulationPush.push({ endpoint: 'https://push-mock.invalid/phone-2', payload });",
          "}",
        ].join("\n");
      }
      if (id === "\0phone-simulation-nitro-task") {
        return "export function defineTask(task) { return task; }";
      }
      return;
    },
  };

  const missedEvents: {
    household_id: string;
    medicine_id: string;
    time: string;
    status: string;
    notified: boolean;
  }[] = [];
  const medicine = {
    id: "medicine-1",
    household_id: "FAM42X",
    name: "Metformin",
    strength: "500 mg",
    times: ["08:00"],
  };
  const fakeSql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = strings.join(" ").replace(/\s+/g, " ").trim().toLowerCase();
    if (query.includes("from care_medicines")) return [medicine];
    if (query.includes("from dose_events")) return [...missedEvents];
    if (query.includes("insert into dose_events")) {
      missedEvents.push({
        household_id: String(values[1]),
        medicine_id: String(values[2]),
        time: String(values[6]),
        status: "missed",
        notified: true,
      });
    }
    return [];
  };
  const simulationGlobals = globalThis as typeof globalThis & {
    __phoneSimulationSql?: typeof fakeSql;
    __phoneSimulationPush?: typeof calls.push;
  };
  simulationGlobals.__phoneSimulationSql = fakeSql;
  simulationGlobals.__phoneSimulationPush = calls.push;

  const realDate = globalThis.Date;
  globalThis.Date = new Proxy(realDate, {
    construct(target, args, newTarget) {
      return Reflect.construct(target, args.length > 0 ? args : [mockedNow.getTime()], newTarget);
    },
    get(target, property, receiver) {
      if (property === "now") return () => mockedNow.getTime();
      return Reflect.get(target, property, receiver);
    },
  });

  const server = await createServer({
    configFile: false,
    root,
    appType: "custom",
    server: { middlewareMode: true },
    plugins: [plugin],
  });
  try {
    const { default: missedDoseTask } = await server.ssrLoadModule(
      "/server/tasks/care/missed-doses.ts",
    );
    assert.deepEqual(await missedDoseTask.run(), { result: { checked: 1, flagged: 1 } });
    assert.equal(calls.push.length, 1);
    assert.equal(calls.push[0].endpoint, "https://push-mock.invalid/phone-2");
    assert.equal(calls.push[0].payload.title, "Missed dose");

    assert.deepEqual(await missedDoseTask.run(), { result: { checked: 1, flagged: 0 } });
    assert.equal(calls.push.length, 1);
    assert.equal(missedEvents[0].status, "missed");
    assert.equal(missedEvents[0].notified, true);
  } finally {
    globalThis.Date = realDate;
    delete simulationGlobals.__phoneSimulationSql;
    delete simulationGlobals.__phoneSimulationPush;
    await server.close();
  }
});
