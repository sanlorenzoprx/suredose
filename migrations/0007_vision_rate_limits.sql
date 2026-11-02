create table if not exists vision_rate_limits (
  ip_hash text primary key,
  window_start timestamptz not null,
  count integer not null check (count >= -1)
);
