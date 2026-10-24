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
  created_at timestamptz not null default now(),
  unique (device_id, medicine_id)
);

create index if not exists pill_images_imprint_idx on pill_images (imprint_norm) where imprint_norm <> '';
create index if not exists pill_images_name_idx on pill_images (name_norm, strength_norm);
create index if not exists pill_images_sha_idx on pill_images (sha256);
create index if not exists pill_images_device_idx on pill_images (device_id);
