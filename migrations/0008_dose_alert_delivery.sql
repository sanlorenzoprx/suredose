-- Unknown legacy zones stay NULL: reopen the patient app to sync its timezone.
alter table care_medicines add column if not exists timezone text;
alter table care_medicines add column if not exists schedule_started_at timestamptz not null default now();
alter table dose_events add column if not exists notification_claim text;
alter table dose_events add column if not exists notification_claim_until timestamptz;
