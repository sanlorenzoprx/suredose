import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { betterAuth } from "better-auth";
import { createD1Sql, compileD1Query, type D1Binding } from "./d1.ts";
import { consumeVisionCheck } from "./vision-rate-limit.ts";
import { runMissedDoses } from "./missed-dose.server.ts";
import { zonedDoseInstant } from "./d1-due.ts";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const file of ["0001_initial.sql", "0002_dose_alert_delivery.sql"]) {
    db.exec(readFileSync(new URL(`../../migrations/d1/${file}`, import.meta.url), "utf8"));
  }
  // Real SQLite execution with D1's prepare/bind/all contract. Built Worker QA
  // separately uses workerd's actual D1 binding (no remote data or credentials).
  const binding: D1Binding = {
    prepare: text => ({ bind: (...values) => ({
      all: async <T>() => ({ results: db.prepare(text).all(...values as never[]) as T[], meta: { changes: 1 } }),
    }) }),
    batch: async () => { throw new Error("unexpected batch"); },
    exec: async text => db.exec(text),
  };
  return { db, binding, sql: createD1Sql(binding) };
}

test("D1 binds repeated parameters, JSON arrays, dates and booleans without interpolating values", async () => {
  const { db, sql } = fixture();
  try {
    await sql`insert into households(id) values (${"TEST42"})`;
    await sql`insert into care_medicines(id,household_id,name,times,timezone)
      values (${"m"},${"TEST42"},${"O'Brien $1"},${JSON.stringify(["08:00"])}::jsonb,${"UTC"})`;
    const rows = await sql<{ times: string[]; name: string; schedule_started_at: string }>`select * from care_medicines where id = any(${["m"]}::text[])`;
    assert.deepEqual(rows[0].times, ["08:00"]);
    assert.equal(rows[0].name, "O'Brien $1");
    assert.ok(Date.parse(rows[0].schedule_started_at));
    assert.deepEqual(await sql`select id from care_medicines where id = any(${[]})`, []);
    assert.deepEqual(await sql.query("select $1 as a, $1 as b", ["' DROP TABLE households --"]), [
      { a: "' DROP TABLE households --", b: "' DROP TABLE households --" },
    ]);
    assert.equal((await sql<{ n: number }>`select count(*)::int as n from households`)[0].n, 1);
    assert.equal(compileD1Query("select '$1::int now()' -- $2::jsonb"), "select '$1::int now()' -- $2::jsonb");
    assert.throws(() => compileD1Query("select $1::unsupported"), /Unsupported/);
  } finally { db.close(); }
});

test("D1 atomic token bucket enforces burst, isolation, refill and concurrent checks", async () => {
  const { db, sql } = fixture();
  try {
    const deps = { getSql: async () => sql };
    const headers = new Headers({ "cf-connecting-ip": "203.0.113.1" });
    assert.deepEqual(await Promise.all([1,2,3,4].map(() => consumeVisionCheck(headers, deps))), [true,true,true,false]);
    assert.equal(await consumeVisionCheck(new Headers({ "cf-connecting-ip": "203.0.113.2" }), deps), true);
    db.exec("update vision_rate_limits set window_start=strftime('%Y-%m-%dT%H:%M:%fZ','now','-181 seconds') where count=-1");
    assert.equal(await consumeVisionCheck(headers, deps), true);
    assert.equal(await consumeVisionCheck(headers, deps), false);
  } finally { db.close(); }
});

test("D1 missed-dose recovery crosses midnight, leases sends, retries and preserves taken rows", async () => {
  const { db, sql } = fixture();
  try {
    db.exec(`insert into households(id) values ('TEST42');
      insert into care_medicines(id,household_id,name,times,timezone,schedule_started_at)
      values ('m','TEST42','Example','["23:00"]','America/Puerto_Rico','2026-11-02T04:00:00Z');`);
    const now = new Date("2026-11-03T05:15:00Z");
    assert.equal((await runMissedDoses(sql, async () => false, now)).result.flagged, 0);
    let sends = 0;
    await Promise.all([1,2].map(() => runMissedDoses(sql, async (_, payload) => {
      sends++; assert.match(payload.body, /2026-11-02 at 23:00/); return true;
    }, now)));
    assert.equal(sends, 1);
    assert.deepEqual(await sql`select notified,verified from dose_events`, [{ notified: true, verified: false }]);
    db.exec("update dose_events set notified=0,status='taken'");
    await runMissedDoses(sql, async () => { assert.fail("taken must not send"); }, now);
    db.exec("update dose_events set status='missed', notification_claim='crashed', notification_claim_until='2026-11-03T05:14:00Z'");
    assert.equal((await runMissedDoses(sql, async () => true, now)).result.flagged, 1);
    db.exec("update care_medicines set timezone='Invalid/Zone'");
    assert.equal((await runMissedDoses(sql, async () => true, now)).result.checked, 0);
  } finally { db.close(); }
});

test("D1 uses PostgreSQL's DST gap/repeated-hour choice without changing server timezone", () => {
  assert.equal(new Date(zonedDoseInstant("2026-03-08", "02:30", "America/New_York")).toISOString(), "2026-03-08T07:30:00.000Z");
  assert.equal(new Date(zonedDoseInstant("2026-11-01", "01:30", "America/New_York")).toISOString(), "2026-11-01T06:30:00.000Z");
});

test("Better Auth persists and resolves real email sessions through its native D1 adapter", async () => {
  const { db, binding } = fixture();
  try {
    const auth = betterAuth({
      database: binding as Parameters<typeof betterAuth>[0]["database"],
      secret: "synthetic-local-auth-test-secret-at-least-32-characters",
      baseURL: "http://localhost:8080", emailAndPassword: { enabled: true },
    });
    const signed = await auth.api.signUpEmail({ asResponse: true, body: { name: "Synthetic", email: "test@example.invalid", password: "local-test-password-123" } });
    assert.equal(signed.status, 200);
    const cookies = signed.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookies }) });
    assert.equal(db.prepare('select count(*) as n from "user"').get()?.n, 1);
    assert.equal(db.prepare('select count(*) as n from "session"').get()?.n, 1);
    assert.equal(session?.user.email, "test@example.invalid");
  } finally { db.close(); }
});
