create table if not exists household_members (
  id text primary key,
  household_id text not null references households (id) on delete cascade,
  device_id text not null,
  role text not null default 'caregiver' check (role = 'caregiver'),
  name text not null default '',
  contact text not null default '',
  is_primary boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (household_id, device_id)
);

create unique index if not exists household_members_one_primary_idx
  on household_members (household_id)
  where is_primary;

create index if not exists household_members_household_joined_idx
  on household_members (household_id, is_primary desc, joined_at asc);
