import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";
import { z } from "zod";
import { batch, fromBool, getDb, parseJson, q, run, stmt, toIso, toParam } from "./db.ts";
import { installTestDb } from "./test-d1.ts";

beforeEach(() => {
  installTestDb();
});

test("getDb explains a missing binding instead of failing obscurely", () => {
  (globalThis as { __env__?: unknown }).__env__ = undefined;
  assert.throws(() => getDb(), /binding `DB` is missing/);
});

test("parameters: booleans become 0/1, dates ISO text, undefined null", () => {
  assert.equal(toParam(true), 1);
  assert.equal(toParam(false), 0);
  assert.equal(toParam(undefined), null);
  assert.equal(toParam(new Date("2026-10-24T17:38:42.123Z")), "2026-10-24T17:38:42.123Z");
  assert.equal(toParam("x"), "x");
  assert.equal(toIso(new Date("2026-10-24T17:38:42Z")), "2026-10-24T17:38:42.000Z");
});

test("fromBool reads SQLite 0/1", () => {
  assert.equal(fromBool(1), true);
  assert.equal(fromBool(0), false);
  assert.equal(fromBool(null), false);
});

test("parseJson validates and falls back on bad data", () => {
  const schema = z.array(z.string());
  assert.deepEqual(parseJson('["08:00","20:00"]', schema, []), ["08:00", "20:00"]);
  assert.deepEqual(parseJson("not json", schema, []), []);
  assert.deepEqual(parseJson('[1,2]', schema, []), []);
  assert.equal(parseJson(null, schema, null), null);
});

test("q and run round-trip rows with bound parameters", async () => {
  const changes = await run("insert into households (id, patient_name) values (?, ?)", ["ABC123", "Ana"]);
  assert.equal(changes, 1);
  const rows = await q<{ id: string; patient_name: string }>("select id, patient_name from households where id = ?", [
    "ABC123",
  ]);
  assert.deepEqual(rows, [{ id: "ABC123", patient_name: "Ana" }]);
});

test("batch is atomic: a failing second statement leaves no partial write", async () => {
  await run("insert into households (id) values (?)", ["H1"]);
  await assert.rejects(
    batch([
      stmt("insert into care_medicines (id, household_id, name) values (?, ?, ?)", ["m1", "H1", "A"]),
      stmt("insert into care_medicines (id, household_id, name) values (?, ?, ?)", ["m1", "H1", "B"]),
    ]),
  );
  assert.deepEqual(await q("select * from care_medicines"), []);
});

test("foreign keys are enforced and deleting a household cascades", async () => {
  await assert.rejects(run("insert into care_medicines (id, household_id, name) values ('m', 'nope', 'X')"));
  await run("insert into households (id) values ('H1')");
  await run("insert into care_medicines (id, household_id, name) values ('m', 'H1', 'X')");
  await run(
    "insert into push_subscriptions (id, household_id, endpoint, p256dh, auth) values ('p', 'H1', 'https://e', 'k', 'a')",
  );
  await run("delete from households where id = 'H1'");
  assert.deepEqual(await q("select * from care_medicines"), []);
  assert.deepEqual(await q("select * from push_subscriptions"), []);
});

test("the dose-event unique constraint holds (one row per household/medicine/date/time)", async () => {
  await run("insert into households (id) values ('H1')");
  const insert = (id: string) =>
    run(
      "insert into dose_events (id, household_id, medicine_id, medicine_name, date, time, status) values (?, 'H1', 'm', 'X', '2026-10-24', '08:00', 'taken')",
      [id],
    );
  await insert("a");
  await assert.rejects(insert("b"));
});

test("mock timers can fix Date for time-based code", () => {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-24T12:00:00Z") });
  assert.equal(toIso(), "2026-10-24T12:00:00.000Z");
  mock.timers.reset();
});
