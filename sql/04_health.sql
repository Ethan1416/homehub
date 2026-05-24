-- Per-day Oura snapshot. Service-role function writes; clients read.
create table if not exists public.health_daily (
  day                 date primary key,
  readiness_score     int,
  sleep_score         int,
  activity_score      int,
  total_sleep_seconds int,
  hrv_avg             int,
  resting_hr          int,
  temp_deviation      numeric,
  steps               int,
  raw                 jsonb,
  updated_at          timestamptz not null default now()
);

alter table public.health_daily enable row level security;
drop policy if exists health_read on public.health_daily;
create policy health_read on public.health_daily for select to anon using (true);
-- writes only via service role (the Edge Function); no anon write policy.

alter publication supabase_realtime add table public.health_daily;
