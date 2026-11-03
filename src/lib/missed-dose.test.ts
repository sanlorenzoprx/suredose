import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "./db.ts";
import { runMissedDoses } from "./missed-dose.server.ts";

async function fixture(zone: string | null = "America/Puerto_Rico", time = "23:00") {
  const db = new PGlite();
  for (const name of ["0002_care_circle.sql", "0008_dose_alert_delivery.sql"])
    await db.exec(readFileSync(new URL(`../../migrations/${name}`, import.meta.url), "utf8"));
  await db.exec("insert into households(id) values ('FAM42X')");
  await db.query(
    "insert into care_medicines(id, household_id, name, times, timezone, schedule_started_at) values ('m','FAM42X','Example',$1::jsonb,$2,'2026-11-02T04:00:00Z')",
    [JSON.stringify([time]), zone],
  );
  const sql = (async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.reduce((out, p, i) => out + (i ? `$${i}` : "") + p, "");
    return (await db.query(query, values)).rows;
  }) as Sql;
  sql.query = async <T>(text: string, values: unknown[] = []) =>
    (await db.query<T>(text, values)).rows;
  return { db, sql };
}
const now = new Date("2026-11-03T05:15:00Z"); // 01:15 Puerto Rico, yesterday's 23:00 is 2h15m late.

test("Phone simulation 7: midnight recovery uses patient timezone, sends once", async () => {
  const { db, sql } = await fixture();
  try {
    let calls = 0;
    const send = async (_code: string, payload: { body: string }) => {
      calls++;
      assert.match(payload.body, /2026-11-02 at 23:00/);
      return true;
    };
    assert.deepEqual(await runMissedDoses(sql, send, now), { result: { checked: 1, flagged: 1 } });
    await runMissedDoses(sql, send, now);
    assert.equal(calls, 1);
    assert.equal(
      (await db.query<{ notified: boolean }>("select notified from dose_events")).rows[0].notified,
      true,
    );
  } finally {
    await db.close();
  }
});

test("failed, missing-config and throwing push sends remain pending and retry", async () => {
  const { db, sql } = await fixture();
  try {
    await runMissedDoses(sql, async () => false, now);
    await runMissedDoses(
      sql,
      async () => {
        throw new Error("offline");
      },
      now,
    );
    assert.equal(
      (await db.query<{ notified: boolean }>("select notified from dose_events")).rows[0].notified,
      false,
    );
    assert.equal((await runMissedDoses(sql, async () => true, now)).result.flagged, 1);
  } finally {
    await db.close();
  }
});

test("taken after the due query cannot be overwritten or notified", async () => {
  const { db, sql } = await fixture();
  try {
    let injected = false;
    const racing = (async (parts: TemplateStringsArray, ...values: unknown[]) => {
      if (!injected && parts.join("").includes("insert into dose_events")) {
        injected = true;
        await db.exec(
          "insert into dose_events(id,household_id,medicine_id,medicine_name,date,time,status,taken_at) values ('taken','FAM42X','m','Example','2026-11-02','23:00','taken',now())",
        );
      }
      return sql(parts, ...values);
    }) as Sql;
    await runMissedDoses(
      racing,
      async () => {
        assert.fail("must not send");
      },
      now,
    );
    assert.equal(
      (await db.query<{ status: string }>("select status from dose_events")).rows[0].status,
      "taken",
    );
  } finally {
    await db.close();
  }
});

test("overlapping jobs share a lease; an expired lease is recoverable", async () => {
  const { db, sql } = await fixture();
  try {
    let calls = 0;
    await Promise.all(
      [1, 2].map(() =>
        runMissedDoses(
          sql,
          async () => {
            calls++;
            return true;
          },
          now,
        ),
      ),
    );
    assert.equal(calls, 1);
    await db.exec(
      "update dose_events set notified=false, notification_claim='crashed', notification_claim_until='2026-11-03T05:14:00Z'",
    );
    await runMissedDoses(
      sql,
      async () => {
        calls++;
        return true;
      },
      now,
    );
    assert.equal(calls, 2);
  } finally {
    await db.close();
  }
});

test("unknown zones are skipped and new schedules do not backfill old misses", async () => {
  const { db, sql } = await fixture(null);
  try {
    assert.equal((await runMissedDoses(sql, async () => true, now)).result.checked, 0);
    await db.exec(
      "update care_medicines set timezone='America/Puerto_Rico', schedule_started_at='2026-11-03T05:00:00Z'",
    );
    assert.equal((await runMissedDoses(sql, async () => true, now)).result.checked, 0);
  } finally {
    await db.close();
  }
});

test("same wall clock in different patient zones is not the same due instant", async () => {
  const { db, sql } = await fixture("America/Los_Angeles");
  try {
    await db.exec("update care_medicines set schedule_started_at='2026-11-02T12:00:00Z'");
    assert.equal((await runMissedDoses(sql, async () => true, now)).result.checked, 0);
  } finally {
    await db.close();
  }
});

test("DST spring gap and repeated fall hour each create one local occurrence", async () => {
  for (const [time, started, before, after, date] of [
    ["02:30", "2026-03-08T05:00:00Z", "2026-03-08T09:29:00Z", "2026-03-08T09:31:00Z", "2026-03-08"],
    ["01:30", "2026-11-01T04:00:00Z", "2026-11-01T08:29:00Z", "2026-11-01T08:31:00Z", "2026-11-01"],
  ]) {
    const { db, sql } = await fixture("America/New_York", time);
    try {
      await db.query("update care_medicines set schedule_started_at=$1", [started]);
      assert.equal(
        (await runMissedDoses(sql, async () => true, new Date(before))).result.checked,
        0,
      );
      assert.equal(
        (await runMissedDoses(sql, async () => true, new Date(after))).result.flagged,
        1,
      );
      assert.equal(
        (await runMissedDoses(sql, async () => true, new Date(after))).result.flagged,
        0,
      );
      const rows = (await db.query<{ date: string }>("select date from dose_events")).rows;
      assert.deepEqual(rows, [{ date }]);
    } finally {
      await db.close();
    }
  }
});

test("malformed legacy times cannot abort the scheduled task", async () => {
  const { db, sql } = await fixture("America/Puerto_Rico", "not-a-time");
  try {
    assert.equal((await runMissedDoses(sql, async () => true, now)).result.checked, 0);
  } finally {
    await db.close();
  }
});
