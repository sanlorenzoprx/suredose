import type { Sql } from "./db.ts";

function wallTime(instant: number, format: Intl.DateTimeFormat): number {
  const p = Object.fromEntries(format.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
}

/** PostgreSQL-compatible disambiguation: later repeated hour; forward spring gap.
 * Offset candidates are derived from the IANA zone around the occurrence, never
 * from the server's timezone. No process.env.TZ mutation across requests.
 */
export function zonedDoseInstant(date: string, time: string, zone: string): number {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const target = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = target + hours * 3_600_000;
    offsets.add(wallTime(sample, format) - sample);
  }
  const candidates = [...offsets].map(offset => target - offset);
  const exact = candidates.filter(c => wallTime(c, format) === target);
  if (exact.length) return Math.max(...exact);
  const forward = candidates.filter(c => wallTime(c, format) > target)
    .sort((a, b) => wallTime(a, format) - wallTime(b, format));
  return forward[0] ?? NaN;
}

export async function d1DueDoses(sql: Sql, now: Date) {
  const medicines = await sql.query<{
    id: string; household_id: string; name: string; strength: string;
    times: string[]; timezone: string | null; schedule_started_at: string;
  }>("select id, household_id, name, strength, times, timezone, schedule_started_at from care_medicines where timezone is not null");
  const due: Array<{ id: string; household_id: string; name: string; strength: string; timezone: string; date: string; time: string }> = [];
  for (const medicine of medicines) {
    if (!medicine.timezone || !Array.isArray(medicine.times)) continue;
    let local: number;
    try {
      local = wallTime(now.getTime(), new Intl.DateTimeFormat("en-US", {
        timeZone: medicine.timezone, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }));
    } catch { continue; } // Invalid/legacy zones must not abort other households.
    for (let days = 0; days <= 2; days++) {
      const date = new Date(local - days * 86_400_000).toISOString().slice(0, 10);
      for (const time of new Set(medicine.times)) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) continue;
        const instant = zonedDoseInstant(date, time, medicine.timezone);
        if (instant >= Date.parse(medicine.schedule_started_at) &&
            instant >= now.getTime() - 48 * 3_600_000 && instant <= now.getTime() - 2 * 3_600_000) {
          due.push({ ...medicine, timezone: medicine.timezone, date, time });
        }
      }
    }
  }
  return due;
}
