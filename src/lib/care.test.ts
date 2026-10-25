import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  createHousehold,
  deleteHousehold,
  fetchActivity,
  getHousehold,
  recordDoseEvent,
  sendTestAlert,
  subscribePush,
  syncMedicines,
  unsubscribePush,
} from "./care.ts";
import { q } from "./db.ts";
import { installTestDb } from "./test-d1.ts";

beforeEach(() => {
  installTestDb();
});

async function newHousehold(): Promise<string> {
  const res = await createHousehold({
    data: { patientName: "Ana", caregiverName: "Luis", caregiverPhone: "555" },
  });
  assert.equal(res.ok, true);
  return (res as { ok: true; code: string }).code;
}

const dose = (code: string, over: Record<string, unknown> = {}) => ({
  code,
  medicineId: "m1",
  medicineName: "Lisinopril",
  strength: "10 mg",
  date: "2026-10-24",
  time: "08:00",
  status: "taken" as const,
  verified: true,
  ...over,
});

test("a household can be created and looked up by its code", async () => {
  const code = await newHousehold();
  assert.match(code, /^[A-Z2-9]{6}$/);
  assert.deepEqual(await getHousehold({ data: { code: code.toLowerCase() } }), { ok: true, patientName: "Ana" });
  const missing = await getHousehold({ data: { code: "ZZZZZZ" } });
  assert.equal(missing.ok, false);
});

test("medicine times survive the JSON round trip", async () => {
  const code = await newHousehold();
  const res = await syncMedicines({
    data: {
      code,
      medicines: [
        { id: "m2", name: "Zinc", strength: "", times: ["09:00"] },
        { id: "m1", name: "Aspirin", strength: "81 mg", times: ["08:00", "20:00"] },
      ],
    },
  });
  assert.deepEqual(res, { ok: true });
  const feed = await fetchActivity({ data: { code } });
  assert.equal(feed.ok, true);
  if (!feed.ok) return;
  assert.deepEqual(
    feed.medicines.map((m) => [m.name, m.times]),
    [
      ["Aspirin", ["08:00", "20:00"]],
      ["Zinc", ["09:00"]],
    ],
  );
});

test("a malformed times value reads back as an empty schedule, not a crash", async () => {
  const code = await newHousehold();
  await q("insert into care_medicines (id, household_id, name, times) values ('m', ?, 'Odd', 'oops')", [code]);
  const feed = await fetchActivity({ data: { code } });
  assert.equal(feed.ok && feed.medicines[0].times.length, 0);
});

test("syncMedicines is atomic: a failed rewrite keeps the previous list", async () => {
  const code = await newHousehold();
  await syncMedicines({ data: { code, medicines: [{ id: "keep", name: "Keep me", strength: "", times: ["08:00"] }] } });
  await assert.rejects(
    syncMedicines({
      data: {
        code,
        medicines: [
          { id: "dup", name: "A", strength: "", times: [] },
          { id: "dup", name: "B", strength: "", times: [] },
        ],
      },
    }),
  );
  const rows = await q<{ id: string }>("select id from care_medicines where household_id = ?", [code]);
  assert.deepEqual(rows.map((r) => r.id), ["keep"]);
});

test("syncMedicines refuses an unknown code", async () => {
  assert.deepEqual(await syncMedicines({ data: { code: "NOPE22", medicines: [] } }), { ok: false });
});

test("dose events: booleans come back real, a repeat updates instead of duplicating", async () => {
  const code = await newHousehold();
  await recordDoseEvent({ data: dose(code, { verified: false, checkImage: "data:image/jpeg;base64,AAA" }) });
  await recordDoseEvent({ data: dose(code, { verified: true }) }); // same slot, no new photo
  const rows = await q<{ n: number }>("select count(*) as n from dose_events");
  assert.equal(rows[0].n, 1);
  const feed = await fetchActivity({ data: { code } });
  assert.equal(feed.ok, true);
  if (!feed.ok) return;
  const [item] = feed.activity;
  assert.equal(item.verified, true);
  assert.equal(item.checkImage, "data:image/jpeg;base64,AAA"); // coalesce keeps the earlier photo
  assert.equal(typeof item.takenAt, "number");
  assert.ok(Math.abs((item.takenAt as number) - Date.now()) < 60_000);
});

test("the activity feed lists newest first and honors the limit", async () => {
  const code = await newHousehold();
  await recordDoseEvent({ data: dose(code, { time: "08:00" }) });
  await new Promise((r) => setTimeout(r, 5));
  await recordDoseEvent({ data: dose(code, { time: "20:00", medicineId: "m2" }) });
  const feed = await fetchActivity({ data: { code, limit: 1 } });
  assert.equal(feed.ok && feed.activity.length, 1);
  assert.equal(feed.ok && feed.activity[0].time, "20:00");
});

test("a missed event has no taken time and reads as not verified", async () => {
  const code = await newHousehold();
  await recordDoseEvent({ data: dose(code, { status: "missed", verified: false }) });
  const feed = await fetchActivity({ data: { code } });
  assert.equal(feed.ok && feed.activity[0].takenAt, null);
  assert.equal(feed.ok && feed.activity[0].verified, false);
});

test("push subscriptions upsert by endpoint and can be removed", async () => {
  const code = await newHousehold();
  const subscription = { endpoint: "https://push.example/abc", keys: { p256dh: "k1", auth: "a1" } };
  assert.deepEqual(await subscribePush({ data: { code, subscription } }), { ok: true });
  await subscribePush({ data: { code, subscription: { ...subscription, keys: { p256dh: "k2", auth: "a2" } } } });
  const rows = await q<{ p256dh: string }>("select p256dh from push_subscriptions");
  assert.deepEqual(rows, [{ p256dh: "k2" }]);
  await unsubscribePush({ data: { endpoint: subscription.endpoint } });
  assert.deepEqual(await q("select * from push_subscriptions"), []);
  const unknown = await subscribePush({ data: { code: "NOPE22", subscription } });
  assert.equal(unknown.ok, false);
});

test("deleteHousehold removes the household and everything under it", async () => {
  const code = await newHousehold();
  await syncMedicines({ data: { code, medicines: [{ id: "m1", name: "A", strength: "", times: ["08:00"] }] } });
  await recordDoseEvent({ data: dose(code) });
  await subscribePush({
    data: { code, subscription: { endpoint: "https://push.example/x", keys: { p256dh: "k", auth: "a" } } },
  });
  assert.deepEqual(await deleteHousehold({ data: { code } }), { ok: true });
  for (const table of ["households", "care_medicines", "dose_events", "push_subscriptions"]) {
    assert.deepEqual(await q(`select * from ${table}`), [], table);
  }
});

test("creating a household surfaces a missing database instead of reporting a code clash", async () => {
  (globalThis as { __env__?: unknown }).__env__ = undefined;
  await assert.rejects(
    createHousehold({ data: { patientName: "Ana", caregiverName: "", caregiverPhone: "" } }),
    /binding `DB` is missing/,
  );
});

const household = (code: string) =>
  q<{ timezone: string | null }>("select timezone from households where id = ?", [code]);

test("the patient's timezone is stored with the household, and bad ones are not", async () => {
  const withZone = await createHousehold({
    data: { patientName: "A", caregiverName: "", caregiverPhone: "", timezone: "America/New_York" },
  });
  const bad = await createHousehold({
    data: { patientName: "B", caregiverName: "", caregiverPhone: "", timezone: "Mars/Olympus" },
  });
  const none = await createHousehold({ data: { patientName: "C", caregiverName: "", caregiverPhone: "" } });
  assert.deepEqual(await household((withZone as { code: string }).code), [{ timezone: "America/New_York" }]);
  assert.deepEqual(await household((bad as { code: string }).code), [{ timezone: null }]);
  assert.deepEqual(await household((none as { code: string }).code), [{ timezone: null }]);
});

test("syncing medicines fills in a missing timezone and never erases a known one", async () => {
  const code = await newHousehold(); // created without a timezone, like a pre-migration household
  assert.deepEqual(await household(code), [{ timezone: null }]);
  await syncMedicines({ data: { code, medicines: [], timezone: "America/Chicago" } });
  assert.deepEqual(await household(code), [{ timezone: "America/Chicago" }]);
  await syncMedicines({ data: { code, medicines: [] } });
  assert.deepEqual(await household(code), [{ timezone: "America/Chicago" }]);
  await syncMedicines({ data: { code, medicines: [], timezone: "Not/AZone" } });
  assert.deepEqual(await household(code), [{ timezone: "America/Chicago" }]);
});

test("a test alert only goes to a phone registered under that family code", async () => {
  const code = await newHousehold();
  const endpoint = "https://push.example/phone-1";
  const unknown = await sendTestAlert({ data: { code, endpoint } });
  assert.equal(unknown.ok, false);
  assert.match((unknown as { error: string }).error, /not registered/);

  await subscribePush({ data: { code, subscription: { endpoint, keys: { p256dh: "k", auth: "a" } } } });
  const other = await newHousehold();
  const wrongHousehold = await sendTestAlert({ data: { code: other, endpoint } });
  assert.equal(wrongHousehold.ok, false);
});

test("a test alert says so plainly when the server has no push keys", async () => {
  const code = await newHousehold();
  const endpoint = "https://push.example/phone-2";
  await subscribePush({ data: { code, subscription: { endpoint, keys: { p256dh: "k", auth: "a" } } } });
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
  const res = await sendTestAlert({ data: { code, endpoint } });
  assert.equal(res.ok, false);
  assert.match((res as { error: string }).error, /push keys are missing/);
});
