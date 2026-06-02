-- 10. "Took the day off" rest markers + carry-over notes.

-- Rest-day markers. event_key = '*' marks a WHOLE day as intentional rest;
-- an event id marks just that task as off for the day. A rest day/task bridges
-- the streak (counts as intentional rest, not a miss) and renders as "Rest".
create table if not exists public.day_off (
  log_date   date not null,
  user_id    text not null default 'ethan',
  event_key  text not null default '*',
  created_at timestamptz not null default now(),
  primary key (log_date, user_id, event_key)
);
alter table public.day_off enable row level security;
drop policy if exists day_off_all on public.day_off;
create policy day_off_all on public.day_off for all to anon using (true) with check (true);
alter publication supabase_realtime add table public.day_off;

-- Carry-over notes: a reminder that rolls forward to every new day until it's
-- checked off. Shown atop Tasks each day from created_on until done.
create table if not exists public.carryover (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null default 'ethan',
  body       text not null,
  created_on date not null default current_date,
  done       boolean not null default false,
  done_on    date,
  updated_at timestamptz not null default now()
);
alter table public.carryover enable row level security;
drop policy if exists carryover_all on public.carryover;
create policy carryover_all on public.carryover for all to anon using (true) with check (true);
alter publication supabase_realtime add table public.carryover;
