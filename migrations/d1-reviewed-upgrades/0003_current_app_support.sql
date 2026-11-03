-- PREPARED ONLY: requires explicit live migration approval.
-- Target: suredose / f0ff8234-58ff-420f-9ffa-b5363ed713ad.
-- Matched to Nov 3 schema and existing 0001_init/0002_household_timezone history.
-- Kept outside automatic migrations_dir deliberately.

create table if not exists "user" (
  "id" text not null primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" integer not null,
  "image" text,
  "createdAt" text default CURRENT_TIMESTAMP not null,
  "updatedAt" text default CURRENT_TIMESTAMP not null
);

create table if not exists "session" (
  "id" text not null primary key,
  "expiresAt" text not null,
  "token" text not null unique,
  "createdAt" text default CURRENT_TIMESTAMP not null,
  "updatedAt" text not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user" ("id") on delete cascade
);

create table if not exists "account" (
  "id" text not null primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" text,
  "refreshTokenExpiresAt" text,
  "scope" text,
  "password" text,
  "createdAt" text default CURRENT_TIMESTAMP not null,
  "updatedAt" text not null
);

create table if not exists "verification" (
  "id" text not null primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" text not null,
  "createdAt" text default CURRENT_TIMESTAMP not null,
  "updatedAt" text default CURRENT_TIMESTAMP not null
);

create index if not exists "session_userId_idx" on "session" ("userId");

create index if not exists "account_userId_idx" on "account" ("userId");

create index if not exists "verification_identifier_idx" on "verification" ("identifier");

create table if not exists caregiver_households (
  user_id text primary key references "user" ("id") on delete cascade,
  household_id text not null references households (id) on delete cascade,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create index if not exists caregiver_households_household_idx
  on caregiver_households (household_id);

create table if not exists household_members (
  id text primary key,
  household_id text not null references households (id) on delete cascade,
  device_id text not null,
  role text not null default 'caregiver' check (role = 'caregiver'),
  name text not null default '',
  contact text not null default '',
  is_primary integer not null default 0,
  joined_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (household_id, device_id)
);

create unique index if not exists household_members_one_primary_idx
  on household_members (household_id)
  where is_primary;

create index if not exists household_members_household_joined_idx
  on household_members (household_id, is_primary desc, joined_at asc);

create table if not exists vision_rate_limits (
  ip_hash text primary key,
  window_start text not null,
  count integer not null check (count >= -1)
);

-- Additive upgrade, separate from PostgreSQL migration tracking.
-- Existing deployments require a schema preflight before applying this file.
alter table care_medicines add column timezone text;
alter table care_medicines add column schedule_started_at text;
update care_medicines set schedule_started_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where schedule_started_at is null;
alter table dose_events add column notification_claim text;
alter table dose_events add column notification_claim_until text;
create trigger care_medicines_schedule_start after insert on care_medicines
when new.schedule_started_at is null
begin
  update care_medicines set schedule_started_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  where household_id = new.household_id and id = new.id;
end;
