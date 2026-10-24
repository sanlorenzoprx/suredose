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

async function seedDay() {
  await run("insert into households (id) values ('H1')");
  await run("insert into care_medicines (id, household_id, name, strength, times) values (?, 'H1', ?, ?, ?)", [
    "m1",
    "Aspirin",
    "81 mg",
    JSON.stringify(["08:00", "11:00", "20:00"]),
  ]);
}

test("missed-dose cron flags late slots once, in one batch, and leaves the rest alone", async () => {
  await seedDay();
  mock.timers.enable({ apis: ["Date"], now: new Date(2026, 9, 24, 12, 0, 0) }); // local noon
  // 08:00 is 4h late (missed); 11:00 is inside the grace period; 20:00 is later today.
  const first = await missedDoses.run({} as never);
  assert.deepEqual(first, { result: { checked: 3, flagged: 1 } });
  const rows = await q<{ time: string; status: string; notified: number; verified: number }>(
    "select time, status, notified, verified from dose_events",
  );
  assert.deepEqual(rows, [{ time: "08:00", status: "missed", notified: 1, verified: 0 }]);
  const second = await missedDoses.run({} as never);
  assert.deepEqual(second, { result: { checked: 3, flagged: 0 } });
});

test("missed-dose cron skips a dose that was taken", async () => {
  await seedDay();
  await run(
    "insert into dose_events (id, household_id, medicine_id, medicine_name, date, time, status) values ('e', 'H1', 'm1', 'Aspirin', '2026-10-24', '08:00', 'taken')",
  );
  mock.timers.enable({ apis: ["Date"], now: new Date(2026, 9, 24, 12, 0, 0) });
  assert.deepEqual(await missedDoses.run({} as never), { result: { checked: 3, flagged: 0 } });
  assert.equal((await q<{ status: string }>("select status from dose_events"))[0].status, "taken");
});

test("missed-dose cron does nothing with no medicines", async () => {
  assert.deepEqual(await missedDoses.run({} as never), { result: { checked: 0, flagged: 0 } });
});
