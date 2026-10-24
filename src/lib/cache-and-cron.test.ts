import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { q, run } from "./db.ts";
import { installTestDb } from "./test-d1.ts";
import { ingestProducts, lookupByName, lookupByNdc } from "./drug-lookup.server.ts";
import { forgetPillReferences } from "./pill-cache.ts";
import missedDoses from "../../server/tasks/care/missed-doses.ts";

beforeEach(() => {
  installTestDb();
});
afterEach(() => {
  mock.timers.reset();
});

const product = {
  productNdc: "0378-1805",
  genericName: "Lisinopril",
  brandName: "",
  name: "Lisinopril",
  strength: "10 mg",
  form: "tablet",
  labeler: "Mylan",
  rxcui: "314076",
  splSetId: "",
};

test("ingestProducts saves a product and a second ingest updates it in place", async () => {
  const [first] = await ingestProducts("", [product]);
  assert.equal(first.product_ndc, "00378-1805");
  assert.equal(first.image_storage, "none");
  assert.match(first.fetched_at, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  const [second] = await ingestProducts("", [{ ...product, labeler: "Mylan Pharmaceuticals" }]);
  assert.equal(second.labeler, "Mylan Pharmaceuticals");
  assert.equal((await q<{ n: number }>("select count(*) as n from drug_products"))[0].n, 1);
});

test("a fresh cached product is returned by NDC without calling the government services", async () => {
  await ingestProducts("", [product]);
  const row = await lookupByNdc("0378-1805-01");
  assert.equal(row?.name, "Lisinopril");
});

test("the name cache stores JSON text and serves it back parsed", async () => {
  const result = { found: true, rxcui: "314076", name: "Lisinopril", strength: "10 mg", form: "tablet" };
  await run("insert into drug_name_lookups (query_key, result, fetched_at) values (?, ?, ?)", [
    "lisinopril|10mg",
    JSON.stringify(result),
    new Date().toISOString(),
  ]);
  assert.deepEqual(await lookupByName("Lisinopril", "10 mg"), result);
});

test("forgetPillReferences deletes one medicine's photo, or all of a phone's", async () => {
  const insert = (id: string, medicine: string, device = "device-0001") =>
    run(
      `insert into pill_images (id, device_id, medicine_id, sha256, name, name_norm, storage, inline_image, bytes)
       values (?, ?, ?, ?, 'X', 'x', 'inline', 'data:', 10)`,
      [id, device, medicine, `sha-${id}`],
    );
  await insert("a", "m1");
  await insert("b", "m2");
  await insert("c", "m1", "device-0002");
  assert.deepEqual(await forgetPillReferences({ data: { deviceId: "device-0001", medicineId: "m1" } }), {
    ok: true,
    deleted: 1,
  });
  assert.deepEqual(await forgetPillReferences({ data: { deviceId: "device-0001" } }), { ok: true, deleted: 1 });
  assert.deepEqual((await q<{ id: string }>("select id from pill_images")).map((r) => r.id), ["c"]);
});

async function seedDay(timezone: string | null = "America/New_York", times = ["15:29", "17:00", "20:00"]) {
  await run("insert into households (id, timezone) values ('H1', ?)", [timezone]);
  await run("insert into care_medicines (id, household_id, name, strength, times) values (?, 'H1', ?, ?, ?)", [
    "m1",
    "Aspirin",
    "81 mg",
    JSON.stringify(times),
  ]);
}

const at = (iso: string) => mock.timers.enable({ apis: ["Date"], now: new Date(iso) });
const doseRows = () =>
  q<{ date: string; time: string; status: string; notified: number; verified: number }>(
    "select date, time, status, notified, verified from dose_events order by date, time",
  );

test("missed-dose cron judges a dose on the patient's clock, not the server's UTC clock", async () => {
  await seedDay();
  // 19:45 UTC is 15:45 in New York: the 15:29 dose is only 16 minutes late.
  at("2026-10-24T19:45:59Z");
  assert.deepEqual(await missedDoses.run({} as never), { result: { checked: 3, flagged: 0, skipped: 0 } });
  assert.deepEqual(await doseRows(), []);
});

test("missed-dose cron flags a late slot once, in one batch, and leaves the rest alone", async () => {
  await seedDay();
  // 22:00 UTC is 18:00 in New York: 15:29 is 2h31 late, 17:00 is inside the grace period.
  at("2026-10-24T22:00:00Z");
  assert.deepEqual(await missedDoses.run({} as never), { result: { checked: 3, flagged: 1, skipped: 0 } });
  assert.deepEqual(await doseRows(), [
    { date: "2026-10-24", time: "15:29", status: "missed", notified: 1, verified: 0 },
  ]);
  assert.deepEqual(await missedDoses.run({} as never), { result: { checked: 3, flagged: 0, skipped: 0 } });
});

test("missed-dose cron uses the household's own date when it differs from UTC's", async () => {
  await seedDay("Asia/Tokyo", ["01:00"]);
  // 19:45 UTC on the 24th is 04:45 on the 25th in Tokyo.
  at("2026-10-24T19:45:00Z");
  assert.deepEqual(await missedDoses.run({} as never), { result: { checked: 1, flagged: 1, skipped: 0 } });
  assert.deepEqual(await doseRows(), [
    { date: "2026-10-25", time: "01:00", status: "missed", notified: 1, verified: 0 },
  ]);
});

test("missed-dose cron skips a household that has not reported a timezone", async () => {
  await seedDay(null);
  at("2026-10-24T22:00:00Z");
  assert.deepEqual(await missedDoses.run({} as never), { result: { checked: 0, flagged: 0, skipped: 1 } });
  assert.deepEqual(await doseRows(), []);
});

test("missed-dose cron skips a dose that was taken", async () => {
  await seedDay();
  await run(
    "insert into dose_events (id, household_id, medicine_id, medicine_name, date, time, status) values ('e', 'H1', 'm1', 'Aspirin', '2026-10-24', '15:29', 'taken')",
  );
  at("2026-10-24T22:00:00Z");
  assert.deepEqual(await missedDoses.run({} as never), { result: { checked: 3, flagged: 0, skipped: 0 } });
  assert.equal((await q<{ status: string }>("select status from dose_events"))[0].status, "taken");
});

test("missed-dose cron does nothing with no medicines", async () => {
  assert.deepEqual(await missedDoses.run({} as never), { result: { checked: 0, flagged: 0, skipped: 0 } });
});
