import { defineTask } from "nitro/task";
import { getSql } from "../../../src/lib/db";
import { sendPushToHousehold } from "../../../src/lib/push.server";
import { GRACE_MS, formatTimeLabel, parseTimeOnDate, todayISO } from "../../../src/lib/schedule";

function doseEventId(householdId: string, medicineId: string, date: string, time: string): string {
  return `dose_${householdId}_${medicineId}_${date}_${time}`.replace(/[^a-zA-Z0-9_:-]/g, "_");
}

/**
 * Runs on a schedule (see `scheduledTasks` in vite.config.ts — Cloudflare
 * wires this to a native Cron Trigger automatically at build time; other
 * presets run it with an in-process cron engine instead).
 *
 * The patient's phone is the source of truth for the schedule and only
 * pushes a "taken" event when a dose is confirmed — it never tells the
 * server about a miss. So this task is what actually watches the clock:
 * once a scheduled time is more than GRACE_MS in the past with no "taken"
 * event on record, it marks that slot missed and alerts the caregiver.
 * Each slot is only ever flagged once (`notified` guards against re-alerting
 * on every run).
 */
export default defineTask({
  meta: {
    name: "care:missed-doses",
    description: "Flag any dose past its grace period as missed and alert the caregiver.",
  },
  async run() {
    const sql = await getSql();
    const now = new Date();
    const date = todayISO(now);

    const medicines = await sql<{
      id: string;
      household_id: string;
      name: string;
      strength: string;
      times: string[];
    }>`select id, household_id, name, strength, times from care_medicines`;

    if (medicines.length === 0) return { result: { checked: 0, flagged: 0 } };

    const existing = await sql<{
      household_id: string;
      medicine_id: string;
      time: string;
      status: string;
      notified: boolean;
    }>`select household_id, medicine_id, time, status, notified from dose_events where date = ${date}`;
    const existingByKey = new Map(
      existing.map((e) => [`${e.household_id}|${e.medicine_id}|${e.time}`, e]),
    );

    let checked = 0;
    let flagged = 0;

    for (const medicine of medicines) {
      const times = Array.isArray(medicine.times) ? medicine.times : [];
      for (const time of times) {
        checked += 1;
        const scheduledAt = parseTimeOnDate(date, time);
        if (now.getTime() - scheduledAt.getTime() < GRACE_MS) continue; // not late yet

        const key = `${medicine.household_id}|${medicine.id}|${time}`;
        const row = existingByKey.get(key);
        if (row && (row.status === "taken" || (row.status === "missed" && row.notified))) continue;

        const id = doseEventId(medicine.household_id, medicine.id, date, time);
        await sql`
          insert into dose_events
            (id, household_id, medicine_id, medicine_name, strength, date, time, status, verified, notified)
          values
            (${id}, ${medicine.household_id}, ${medicine.id}, ${medicine.name}, ${medicine.strength}, ${date}, ${time}, 'missed', false, true)
          on conflict (household_id, medicine_id, date, time) do update set
            status = 'missed',
            notified = true
        `;

        const label = [medicine.name, medicine.strength].filter(Boolean).join(" ");
        await sendPushToHousehold(medicine.household_id, {
          title: "Missed dose",
          body: `${label} was due at ${formatTimeLabel(time)} and has not been marked taken.`,
          tag: `missed-${id}`,
        }).catch(() => {
          /* push is best-effort — never let a notification failure block the check */
        });
        flagged += 1;
      }
    }

    return { result: { checked, flagged } };
  },
});
