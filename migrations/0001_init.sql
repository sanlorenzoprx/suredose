-- SureDose schema for Cloudflare D1 (SQLite). Apply with:
--   npx wrangler d1 migrations apply suredose --local     (local)
--   npx wrangler d1 migrations apply suredose --remote    (deployed)
--
-- Conventions (see the D1 port plan):
--   * timestamps are ISO-8601 UTC text ("2026-10-24T17:36:17Z"), written by
--     the app with new Date().toISOString(); column defaults use strftime;
--   * JSON is stored as TEXT (JSON.stringify on write, parsed + validated on read);
--   * booleans are INTEGER 0/1 (the adapter in src/lib/db.ts converts);
--   * D1 enforces foreign keys, so "on delete cascade" works as written.

-- Care Circle: lets a caregiver's phone pair with a patient's phone so it can
-- see dose activity (with the confirmation photo) and get alerted to a
-- missed dose, without a full account system.
--
-- There is no signed-in user: "household_id" (the shareable pairing code,
-- e.g. "K3F7QM") is the only scope. Treat a code like a shared link — anyone
-- who has it can read and write that household's rows. Keep this in mind
-- before storing more than a first name, a phone number, and pill
-- name/strength/schedule here.
create table if not exists households (
  id text primary key,
  patient_name text not null default '',
  caregiver_name text not null default '',
  caregiver_phone text not null default '',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- A light mirror of the patient's medicine schedule (name/strength/times
-- only, no photos) — just enough for the missed-dose check and the
-- caregiver's read-only pill list. The patient's phone is the source of
-- truth and re-sends this list whenever it changes. `times` is a JSON array.
create table if not exists care_medicines (
  id text not null,
  household_id text not null references households (id) on delete cascade,
  name text not null,
  strength text not null default '',
  times text not null default '[]',
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
  taken_at text,
  verified integer not null default 0,
  check_image text,
  notified integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  unique (household_id, medicine_id, date, time)
);
create index if not exists dose_events_household_idx on dose_events (household_id, date);

create table if not exists push_subscriptions (
  id text primary key,
  household_id text not null references households (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
create index if not exists push_subscriptions_household_idx on push_subscriptions (household_id);

-- Official drug data cache, shared by every user of the app.
--
-- When a bottle is checked, the app looks the medicine up in the U.S.
-- government's public drug data (openFDA NDC directory, NLM DailyMed labels,
-- NLM RxNorm) and keeps the answer here so the next person with the same
-- medicine gets it instantly. Nothing personal is stored: only public drug
-- facts keyed by product code or by drug name + strength.
--
-- drug_products: one row per FDA product (labeler + product NDC). The same
-- drug and strength from a different maker is a different row, because it
-- is a different-looking pill. The maker's pill photo from the DailyMed
-- label lives in Cloudflare R2 (binding PILL_IMAGES, key
-- official/<sha256>.jpg), or inline here when there is no R2 (local dev).
create table if not exists drug_products (
  product_ndc text primary key,          -- canonical 5-4, e.g. 00378-1805
  label_ndc text not null,               -- as FDA lists it, e.g. 0378-1805
  name text not null,
  generic_name text not null default '',
  brand_name text not null default '',
  strength text not null default '',
  form text not null default '',
  labeler text not null default '',
  rxcui text not null default '',
  spl_set_id text not null default '',
  colors text not null default '',       -- comma-separated, e.g. "white" or "blue,white"
  shape text not null default '',
  size_mm integer,
  imprint text not null default '',
  appearance text not null default '',   -- "White round tablet, marked M / 367"
  image_storage text not null default 'none' check (image_storage in ('r2', 'inline', 'none')),
  image_sha text,
  inline_image text,
  fetched_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

create index if not exists drug_products_rxcui_idx on drug_products (rxcui);
create index if not exists drug_products_set_idx on drug_products (spl_set_id);

-- RxNorm answers for "name + strength" checks (used when the bottle's NDC
-- can't be read). `result` is the JSON text the app returns to the phone.
create table if not exists drug_name_lookups (
  query_key text primary key,            -- normalized "name|strength"
  result text not null,
  fetched_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Pill library: a pill photo the person CHOSE to share (opt-in checkbox on
-- the pill photo step of "Add a medicine"), with the medicine name and
-- strength they confirmed and the pill's visible features (imprint, color,
-- shape) read by the vision model. It is meant for future pill search.
--
-- What is never stored here:
--   * the bottle photo (the label carries the patient's name, address,
--     pharmacy and Rx number);
--   * practice photos, or a photo whose pill did NOT look like the maker's
--     official photo (its label may be wrong);
--   * medicines that already have a maker's photo in drug_products — the
--     library only fills gaps the official data leaves.
--
-- Rows carry a random per-phone device_id, not a family code or a name. It
-- exists so a person can delete their photos: removing a medicine deletes
-- its row, and the Family tab can delete all of them.
--
-- Labels come from users, so `ndc` / `verified_by` record how the medicine
-- was checked against official data when it was added; search should trust
-- NDC-verified rows first.
--
-- The image lives in Cloudflare R2 (binding PILL_IMAGES, key
-- pills/<sha256>.jpg), or inline here when there is no R2 (local dev).
create table if not exists pill_images (
  id text primary key,
  device_id text not null,
  medicine_id text not null,
  sha256 text not null,
  name text not null,
  name_norm text not null,
  strength text not null default '',
  strength_norm text not null default '',
  ndc text not null default '',
  verified_by text not null default 'none' check (verified_by in ('ndc', 'name', 'none')),
  imprint text not null default '',
  imprint_norm text not null default '',
  color text not null default '',
  shape text not null default '',
  form text not null default '',
  storage text not null check (storage in ('r2', 'inline')),
  inline_image text,
  bytes integer not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  unique (device_id, medicine_id)
);

create index if not exists pill_images_imprint_idx on pill_images (imprint_norm) where imprint_norm <> '';
create index if not exists pill_images_name_idx on pill_images (name_norm, strength_norm);
create index if not exists pill_images_sha_idx on pill_images (sha256);
create index if not exists pill_images_device_idx on pill_images (device_id);
