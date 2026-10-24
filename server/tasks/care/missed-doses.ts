import { defineTask } from "nitro/task";
import { batch, fromBool, parseJson, q, stmt, stringArraySchema, toIso } from "../../../src/lib/db";
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
    const now = new Date();
    const date = todayISO(now);

    const medicines = await q<{
      id: string;
      household_id: string;
      name: string;
      strength: string;
      times: string;
    }>("select id, household_id, name, strength, times from care_medicines");

    if (medicines.length === 0) return { result: { checked: 0, flagged: 0 } };

    const existing = await q<{
      household_id: string;
      medicine_id: string;
      time: string;
      status: string;
      notified: number;
    }>(
      "select household_id, medicine_id, time, status, notified from dose_events where date = ?",
      [date],
    );
    const existingByKey = new Map(
      existing.map((e) => [
        `${e.household_id}|${e.medicine_id}|${e.time}`,
        { status: e.status, notified: fromBool(e.notified) },
      ]),
    );

    let checked = 0;
    // Slots found missed this run: written in one batch, then alerted.
    const missed: {
      id: string;
      householdId: string;
      label: string;
      time: string;
      medicineId: string;
      medicineName: string;
      strength: string;
    }[] = [];
    const nowIso = toIso(now);

    for (const medicine of medicines) {
      const times = parseJson(medicine.times, stringArraySchema, []);
      for (const time of times) {
        checked += 1;
        const scheduledAt = parseTimeOnDate(date, time);
        if (now.getTime() - scheduledAt.getTime() < GRACE_MS) continue; // not late yet

        const key = `${medicine.household_id}|${medicine.id}|${time}`;
        const row = existingByKey.get(key);
        if (row && (row.status === "taken" || (row.status === "missed" && row.notified))) continue;

        missed.push({
          id: doseEventId(medicine.household_id, medicine.id, date, time),
          householdId: medicine.household_id,
          label: [medicine.name, medicine.strength].filter(Boolean).join(" "),
          time,
          medicineId: medicine.id,
          medicineName: medicine.name,
          strength: medicine.strength,
        });
      }
    }

    // One atomic write for every slot found this run; alerts go out only
    // after the rows are saved, so a failed write never sends a push for a
    // miss that was not recorded (the next run simply tries again).
    await batch(
      missed.map((m) =>
        stmt(
          `insert into dose_events
            (id, household_id, medicine_id, medicine_name, strength, date, time, status, verified, notified, created_at)
           values
            (?, ?, ?, ?, ?, ?, ?, 'missed', 0, 1, ?)
           on conflict (household_id, medicine_id, date, time) do update set
            status = 'missed',
            notified = 1`,
          [m.id, m.householdId, m.medicineId, m.medicineName, m.strength, date, m.time, nowIso],
        ),
      ),
    );

    for (const m of missed) {
      await sendPushToHousehold(m.householdId, {
        title: "Missed dose",
        body: `${m.label} was due at ${formatTimeLabel(m.time)} and has not been marked taken.`,
        tag: `missed-${m.id}`,
      }).catch(() => {
        /* push is best-effort — never let a notification failure block the check */
      });
    }
    const flagged = missed.length;

    return { result: { checked, flagged } };
  },
});
