import type { Sql } from "./db.ts";

type Sender = (
  code: string,
  payload: { title: string; body: string; tag: string },
) => Promise<boolean>;
type Due = {
  id: string;
  household_id: string;
  name: string;
  strength: string;
  date: string;
  time: string;
  timezone: string;
};

/** Recover the previous 48 hours, including local yesterday across midnight.
 * Postgres resolves DST gaps/repeats with its standard-time preference. Each
 * local date/time is one occurrence; repeated fall-back hours cannot double-log.
 */
export async function runMissedDoses(sql: Sql, send: Sender, now = new Date()) {
  const due = await sql<Due>`
    select m.id, m.household_id, m.name, m.strength, m.timezone,
      to_char(d.day, 'YYYY-MM-DD') as date, t.time
    from care_medicines m
    join pg_timezone_names z on z.name = m.timezone
    cross join lateral generate_series(
      (${now}::timestamptz at time zone m.timezone)::date - 2,
      (${now}::timestamptz at time zone m.timezone)::date,
      interval '1 day'
    ) d(day)
    cross join lateral jsonb_array_elements_text(m.times) t(time)
    cross join lateral (select (d.day::date + case when t.time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then t.time::time end) at time zone m.timezone as instant) s
    where t.time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and s.instant >= m.schedule_started_at
      and s.instant >= ${now}::timestamptz - interval '48 hours'
      and s.instant <= ${now}::timestamptz - interval '2 hours'
  `;
  let flagged = 0;
  for (const dose of due) {
    const id = `dose_${dose.household_id}_${dose.id}_${dose.date}_${dose.time}`.replace(
      /[^a-zA-Z0-9_:-]/g,
      "_",
    );
    const token = crypto.randomUUID();
    const claimed = await sql`
      insert into dose_events
        (id, household_id, medicine_id, medicine_name, strength, date, time, status, verified, notified, notification_claim, notification_claim_until)
      values (${id}, ${dose.household_id}, ${dose.id}, ${dose.name}, ${dose.strength}, ${dose.date}, ${dose.time}, 'missed', false, false, ${token}, ${now}::timestamptz + interval '5 minutes')
      on conflict (household_id, medicine_id, date, time) do update set
        notification_claim = excluded.notification_claim,
        notification_claim_until = excluded.notification_claim_until
      where dose_events.status = 'missed' and not dose_events.notified
        and (dose_events.notification_claim_until is null or dose_events.notification_claim_until <= ${now})
      returning id
    `;
    if (!claimed.length) continue;
    const stillMissed =
      await sql`select id from dose_events where id = ${id} and status = 'missed' and notification_claim = ${token}`;
    if (!stillMissed.length) continue;
    let delivered = false;
    try {
      delivered = await send(dose.household_id, {
        title: "Missed dose",
        body: `${[dose.name, dose.strength].filter(Boolean).join(" ")} was due ${dose.date} at ${dose.time} (${dose.timezone}) and has not been marked taken.`,
        tag: `missed-${id}`,
      });
    } catch {
      /* Leave pending for retry. A stable tag replaces duplicate device notifications. */
    }
    await sql`update dose_events set notified = ${delivered}, notification_claim = null, notification_claim_until = null
      where id = ${id} and status = 'missed' and notification_claim = ${token}`;
    if (delivered) flagged += 1;
  }
  return { result: { checked: due.length, flagged } };
}
