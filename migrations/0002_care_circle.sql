-- Care Circle: lets a caregiver's phone pair with a patient's phone so it can
-- see dose activity (with the confirmation photo) and get alerted to a
-- missed dose, without a full account system.
--
-- Auth stays OFF for this app: there is no signed-in user, so "household_id"
-- (the shareable pairing code, e.g. "K3F7QM") is the only scope. Treat a code
-- like a shared link — anyone who has it can read and write that household's
-- rows. Keep this in mind before storing more than a first name, a phone
-- number, and pill name/strength/schedule here.

create table if not exists households (
  id text primary key,
  patient_name text not null default '',
  caregiver_name text not null default '',
  caregiver_phone text not null default '',
  created_at timestamptz not null default now()
);

-- A light mirror of the patient's medicine schedule (name/strength/times
-- only, no photos) — just enough for the missed-dose check and the
-- caregiver's read-only pill list. The patient's phone is the source of
-- truth and re-sends this list whenever it changes.
create table if not exists care_medicines (
  id text not null,
  household_id text not null references households (id) on delete cascade,
  name text not null,
  strength text not null default '',
  times jsonb not null default '[]'::jsonb,
  primary key (household_id, id)
);

create table if not exists dose_events (
  id text primary key,
  household_id text not null references households (id) on delete cascade,
  medicine_id text not null,
  medicine_name text not null,
  strength text not null default '',
  date text not null,
  time text not null,
  status text not null,
  taken_at timestamptz,
  verified boolean not null default false,
  check_image text,
  notified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (household_id, medicine_id, date, time)
);
create index if not exists dose_events_household_idx on dose_events (household_id, date);

create table if not exists push_subscriptions (
  id text primary key,
  household_id text not null references households (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_household_idx on push_subscriptions (household_id);
