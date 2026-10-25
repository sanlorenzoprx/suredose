import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toCrossJSON, fromJSON } from "seroval";
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

// Database journey against the local Worker (`npm run cf:dev`, which runs the
// built app on a local D1 database): a patient creates a family code and
// syncs a medicine, confirms a dose, a caregiver sees it, and the missed-dose
// cron flags a late dose, judged on the patient phone's own clock. Only the AI photo comparison is faked (no provider
// credentials needed); every other server function hits the real local D1.
//
//   node scripts/d1-journey.mjs [http://127.0.0.1:8787/] [screenshot-dir]
const base = checkedUrl(process.argv[2] ?? "http://127.0.0.1:8787/");
const screenshots = process.argv[3] ?? "screenshots";
mkdirSync(screenshots, { recursive: true });

function d1(sql) {
  const res = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", "suredose", "--local", "--persist-to", ".wrangler/state", "--config", "wrangler.jsonc", "--json", "--command", sql],
    { encoding: "utf8" },
  );
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const parsed = JSON.parse(res.stdout.slice(res.stdout.indexOf("[")));
  return parsed[0].results ?? [];
}

const referencePhoto = `data:image/jpeg;base64,${readFileSync("public/samples/white-tablet.jpg").toString("base64")}`;
const now = new Date();
// Both simulated phones sit in New York, hours away from the server's UTC clock,
// so the journey proves the missed-dose check reads times on the phone's clock.
const PHONE_ZONE = "America/New_York";
const today = now.toLocaleDateString("en-CA", { timeZone: PHONE_ZONE }); // YYYY-MM-DD
const patientState = (householdCode, role) => ({
  version: 0,
  state: {
    settings: {
      patientName: "Journey Patient",
      caregiverName: "Journey Caregiver",
      caregiverPhone: "",
      role,
      householdCode,
      onboardingDone: true,
      soundOn: false,
      vibrateOn: false,
      speakOn: false,
    },
    medicines: [
      {
        id: "journey-med",
        name: "Journey Aspirin",
        strength: "81 mg",
        instructions: "Test fixture only",
        bottleImage: "",
        pillImage: referencePhoto,
        times: ["09:30"],
        createdAt: Date.now(),
      },
    ],
    events: [],
    alarmMutedUntil: 0,
  },
});

const browser = await chromium.launch({
  headless: true,
  // Set CHROMIUM_PATH when the installed browser build differs from this
  // project's Playwright version.
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const errors = [];
const hydrated = (page) =>
  page.waitForFunction(() =>
    Object.keys(document.querySelector("button") ?? {}).some((key) => key.startsWith("__reactProps$")),
  );

try {
  // 1. Patient creates a family code; the medicine list is mirrored to D1.
  const phoneOptions = { viewport: { width: 390, height: 844 }, timezoneId: PHONE_ZONE };
  const patient = await (await browser.newContext(phoneOptions)).newPage();
  patient.setDefaultTimeout(20000);
  patient.on("pageerror", (e) => errors.push(e.message));
  await patient.goto(base);
  await patient.evaluate((s) => localStorage.setItem("suredose-v1", JSON.stringify(s)), patientState("", "patient"));
  await patient.goto(new URL("/family", base).href);
  await hydrated(patient);
  await patient.getByRole("button", { name: "Create a family code" }).click();
  await patient.waitForFunction(() => JSON.parse(localStorage.getItem("suredose-v1")).state.settings.householdCode);
  const code = await patient.evaluate(() => JSON.parse(localStorage.getItem("suredose-v1")).state.settings.householdCode);
  assert.match(code, /^[A-Z2-9]{6}$/);
  assert.deepEqual(d1(`select id, patient_name from households where id = '${code}'`), [
    { id: code, patient_name: "Journey Patient" },
  ]);
  for (let i = 0; i < 20 && d1(`select 1 from care_medicines where household_id = '${code}'`).length === 0; i += 1) {
    await patient.waitForTimeout(500);
  }
  const meds = d1(`select id, name, times from care_medicines where household_id = '${code}'`);
  assert.deepEqual(meds, [{ id: "journey-med", name: "Journey Aspirin", times: '["09:30"]' }]);
  // The phone reports its timezone; the cron needs it to read "09:30" correctly.
  const phoneZone = await patient.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  assert.equal(phoneZone, PHONE_ZONE);
  assert.deepEqual(d1(`select timezone from households where id = '${code}'`), [{ timezone: PHONE_ZONE }]);
  console.log("ok  pairing + medicine mirror + timezone", code, phoneZone);

  // 2. Patient confirms a dose (AI comparison faked, recordDoseEvent real).
  await patient.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.continue();
    let body;
    try {
      body = fromJSON(req.postDataJSON());
    } catch {
      return route.continue();
    }
    if (process.env.JOURNEY_DEBUG) console.log("POST", req.url().slice(-20), Object.keys(body?.data ?? {}));
    if (!body?.data?.candidate) return route.continue(); // not the photo comparison
    return route.fulfill({
      status: 200,
      headers: { "content-type": "application/json", "x-tss-serialized": "true" },
      body: JSON.stringify(
        toCrossJSON({
          result: {
            ok: true,
            result: { observation: "similar", nextAction: "none", reason: "The letters, numbers, shape, and color match." },
          },
          context: {},
        }),
      ),
    });
  });
  await patient.goto(
    new URL(`/check?medicineId=journey-med&date=${today}&time=09%3A30&practice=false`, base).href,
  );
  await patient.getByRole("heading", { name: "Take a picture of your pill" }).waitFor();
  await patient.getByRole("button", { name: "Open camera", exact: true }).click();
  const takePhoto = patient.getByRole("button", { name: "Take photo", exact: true });
  await takePhoto.waitFor();
  await patient.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.videoWidth > 0 && v.srcObject;
  });
  await takePhoto.click();
  await patient.getByRole("heading", { name: "Right pill.", exact: true }).waitFor();
  await patient.getByRole("button", { name: "I took it", exact: true }).click();
  for (let i = 0; i < 20 && d1(`select 1 from dose_events where household_id = '${code}'`).length === 0; i += 1) {
    await patient.waitForTimeout(500);
  }
  const [dose] = d1(
    `select medicine_name, status, verified, notified, taken_at, typeof(verified) as vt from dose_events where household_id = '${code}'`,
  );
  assert.equal(dose.medicine_name, "Journey Aspirin");
  assert.equal(dose.status, "taken");
  assert.equal(dose.verified, 1);
  assert.equal(dose.vt, "integer");
  assert.match(dose.taken_at, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  console.log("ok  dose recorded", dose.taken_at);

  // 3. A second device (caregiver) opens the invite link: the code is already
  // filled in, so they only add their name. Then they see the dose.
  const caregiver = await (await browser.newContext(phoneOptions)).newPage();
  caregiver.setDefaultTimeout(20000);
  caregiver.on("pageerror", (e) => errors.push(e.message));
  await caregiver.goto(new URL(`/?join=${code}`, base).href);
  await caregiver.locator("#code").waitFor();
  assert.equal(await caregiver.locator("#code").inputValue(), code, "invite link pre-fills the code");
  await hydrated(caregiver);
  await caregiver.locator("#your-name").fill("Journey Caregiver");
  await caregiver.getByRole("button", { name: "Connect", exact: true }).click();
  await caregiver.getByText("Journey Aspirin").first().waitFor();
  await caregiver.getByText("1 of 1 taken", { exact: false }).waitFor();
  await caregiver.screenshot({ path: join(screenshots, "d1-caregiver-feed.png"), fullPage: true });
  console.log("ok  caregiver joined from the invite link and sees the dose");

  // Turning on alerts must always answer on screen: this local build has no
  // public push key, so the caregiver should be told exactly that, not left guessing.
  await caregiver.getByRole("button", { name: "Turn on alerts", exact: true }).click();
  await caregiver.getByText(/public push key is missing|Alerts are on|Notifications|alert helper/).first().waitFor();
  console.log("ok  turning on alerts shows a result on screen");

  // 4. The missed-dose cron flags a late dose for a second medicine.
  const hourOnPhone = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: phoneZone, hour: "2-digit", hourCycle: "h23" }).format(now),
  );
  const lateHour = hourOnPhone - 3; // 3h ago on the phone's clock: past the 2h grace
  const recentHour = hourOnPhone - 1; // 1h ago: still inside the grace period
  if (lateHour >= 0) {
    const hhmm = (h) => `${String(h).padStart(2, "0")}:00`;
    d1(
      `insert into care_medicines (id, household_id, name, strength, times) values ('late-med', '${code}', 'Late Pill', '5 mg', '["${hhmm(lateHour)}"]'), ('recent-med', '${code}', 'Recent Pill', '5 mg', '["${hhmm(recentHour)}"]')`,
    );
    // Nitro maps the cron expression to its tasks (vite.config.ts scheduledTasks).
    const cron = new URL("/cdn-cgi/local/scheduled?cron=*/15+*+*+*+*", base);
    const res = await fetch(cron);
    assert.equal(res.status, 200);
    let missed = [];
    for (let i = 0; i < 20 && missed.length === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      missed = d1(
        `select medicine_id, status, notified, verified from dose_events where household_id = '${code}' and status = 'missed'`,
      );
    }
    assert.deepEqual(missed, [{ medicine_id: "late-med", status: "missed", notified: 1, verified: 0 }]);
    await fetch(cron); // second run must not duplicate
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(
      d1(`select count(*) as n from dose_events where household_id = '${code}' and status = 'missed'`)[0].n,
      1,
    );
    console.log("ok  missed-dose cron flagged", hhmm(lateHour), "once and left", hhmm(recentHour), "alone");
  } else {
    console.log("skip missed-dose cron (before 03:00 on the phone's clock: no slot is 2h late yet today)");
  }

  // 5. No page error along the way. (Cascade delete is covered by the unit tests.)
  await patient.unroute("**/*");
  assert.deepEqual(errors, [], "no uncaught browser errors");
  console.log("PASS d1 journey");
} finally {
  await browser.close();
}
