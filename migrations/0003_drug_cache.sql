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
  fetched_at timestamptz not null default now()
);

create index if not exists drug_products_rxcui_idx on drug_products (rxcui);
create index if not exists drug_products_set_idx on drug_products (spl_set_id);

-- RxNorm answers for "name + strength" checks (used when the bottle's NDC
-- can't be read). `result` is the JSON the app returns to the phone.
create table if not exists drug_name_lookups (
  query_key text primary key,            -- normalized "name|strength"
  result jsonb not null,
  fetched_at timestamptz not null default now()
);
