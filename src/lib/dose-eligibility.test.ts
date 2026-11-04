import assert from "node:assert/strict";
import { test } from "node:test";
import { doseEligibility, parseTimeOnDate } from "./schedule.ts";
import type { DoseEvent } from "./types.ts";
const medicine = { id: "m", times: ["08:00"] };
const now = new Date(2026, 10, 2, 8, 30);
test("only a real due slot can be confirmed", () => {
  assert.equal(doseEligibility(medicine, [], "2026-11-02", "08:00", now), null);
  for (const [date, time] of [
    ["2026-11-01", "08:00"],
    ["2026-11-03", "08:00"],
    ["2026-11-02", "09:00"],
    ["", ""],
    ["2026-11-02", "25:00"],
  ])
    assert.ok(doseEligibility(medicine, [], date, time, now));
  assert.ok(doseEligibility(medicine, [], "2026-11-02", "08:00", new Date(2026, 10, 2, 7, 59)));
  assert.ok(doseEligibility(medicine, [], "2026-11-02", "08:00", new Date(2026, 10, 2, 10, 1)));
  const event: DoseEvent = {
    id: "e",
    medicineId: "m",
    date: "2026-11-02",
    time: "08:00",
    status: "taken",
    verified: true,
    notified: false,
  };
  assert.ok(doseEligibility(medicine, [event], event.date, event.time, now));
});

test("browser-local DST disambiguation agrees with the alert scheduler", () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/New_York";
  try {
    assert.equal(parseTimeOnDate("2026-11-01", "01:30").toISOString(), "2026-11-01T06:30:00.000Z");
    assert.equal(parseTimeOnDate("2026-03-08", "02:30").toISOString(), "2026-03-08T07:30:00.000Z");
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
