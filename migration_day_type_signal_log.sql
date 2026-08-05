-- One-time migration: per-signal day-type forecast log (v9, July 30)
-- Paste into Supabase SQL editor and run once.
create table if not exists day_type_signal_log (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  log_date date not null,
  day_type text,
  trend_prob int,
  range_prob int,
  confidence text,
  directional_lean text,
  signals jsonb default '[]'::jsonb,
  locked_at timestamptz default now(),
  unique (user_id, log_date)
);
create index if not exists idx_dtsl_user_date on day_type_signal_log (user_id, log_date desc);
