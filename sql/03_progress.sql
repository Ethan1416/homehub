-- Per-occurrence checklist / workout log. One row per (event, date, item).
create table if not exists public.progress (
  event_id   uuid not null references public.events(id) on delete cascade,
  log_date   date not null,
  item_key   text not null,            -- m0, g1s2, __sub__, __done__ …
  done       boolean not null default false,
  weight     text,                     -- gym: free text ("135", "BW+25")
  reps       text,                     -- gym: free text ("8", "8/leg")
  note       text,                     -- meal substitution / freeform
  updated_at timestamptz not null default now(),
  primary key (event_id, log_date, item_key)
);
create index if not exists progress_day_idx on public.progress (log_date);

alter table public.progress enable row level security;
drop policy if exists progress_all on public.progress;
create policy progress_all on public.progress
  for all to anon using (true) with check (true);

alter publication supabase_realtime add table public.progress;
