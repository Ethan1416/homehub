-- Per-set: richer effort labels, half reps, rest between sets, free-text note.
-- Plus a per-day gym override so the user can swap routines on a given day.

-- 1. effort: nothing | warmup | easy | burn | high_effort | max
alter table public.progress drop constraint if exists progress_effort_check;
update public.progress set effort='max' where effort='maxed';
update public.progress set effort=null where effort='could_do_more';
alter table public.progress add constraint progress_effort_check
  check (effort is null or effort in ('nothing','warmup','easy','burn','high_effort','max'));

-- 2. extra per-set fields
alter table public.progress
  add column if not exists half_reps text,
  add column if not exists rest_seconds int,
  add column if not exists set_note text;

-- 3. per-day gym override (let the user "do legs today" even if today is back day)
create table if not exists public.gym_override (
  log_date    date primary key,
  event_id    uuid not null references public.events(id) on delete cascade,
  updated_at  timestamptz not null default now()
);
alter table public.gym_override enable row level security;
drop policy if exists go_all on public.gym_override;
create policy go_all on public.gym_override for all to anon using (true) with check (true);
alter publication supabase_realtime add table public.gym_override;
