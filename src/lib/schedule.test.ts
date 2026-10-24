import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidTimeZone, zonedDateISO, zonedSlotInstant } from "./schedule.ts";

test("a wall-clock time in New York maps to the right instant", () => {
  assert.equal(zonedSlotInstant("2026-10-24", "15:29", "America/New_York").toISOString(), "2026-10-24T19:29:00.000Z");
  assert.equal(zonedSlotInstant("2026-12-24", "15:29", "America/New_York").toISOString(), "2026-12-24T20:29:00.000Z");
  assert.equal(zonedSlotInstant("2026-10-24", "09:00", "UTC").toISOString(), "2026-10-24T09:00:00.000Z");
  assert.equal(zonedSlotInstant("2026-10-25", "01:00", "Asia/Tokyo").toISOString(), "2026-10-24T16:00:00.000Z");
});

test("daylight-saving changeover days resolve to a real instant", () => {
  // Clocks fall back on 2026-11-01: 01:30 happens twice; the first (EDT) is used.
  assert.equal(zonedSlotInstant("2026-11-01", "01:30", "America/New_York").toISOString(), "2026-11-01T05:30:00.000Z");
  // Clocks spring forward on 2026-03-08: 03:30 is already EDT.
  assert.equal(zonedSlotInstant("2026-03-08", "03:30", "America/New_York").toISOString(), "2026-03-08T07:30:00.000Z");
});

test("the date is the one on the zone's wall clock", () => {
  const instant = new Date("2026-10-25T02:30:00Z");
  assert.equal(zonedDateISO(instant, "America/New_York"), "2026-10-24");
  assert.equal(zonedDateISO(instant, "Asia/Tokyo"), "2026-10-25");
  assert.equal(zonedDateISO(instant, "UTC"), "2026-10-25");
});

test("timezone names are validated", () => {
  assert.equal(isValidTimeZone("America/New_York"), true);
  assert.equal(isValidTimeZone("UTC"), true);
  assert.equal(isValidTimeZone("Not/AZone"), false);
  assert.equal(isValidTimeZone(""), false);
});
