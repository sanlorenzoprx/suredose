create table if not exists caregiver_households (
  user_id text primary key references "user" ("id") on delete cascade,
  household_id text not null references households (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists caregiver_households_household_idx
  on caregiver_households (household_id);
