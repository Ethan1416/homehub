-- HomeHub schema. Run in the new Supabase project's SQL editor.

-- ---------- events: the custom shared calendar ----------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  owner       text not null default 'shared'
              check (owner in ('ethan', 'justin', 'shared')),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  all_day     boolean not null default false,
  recurrence  text not null default 'none' check (recurrence in ('none','daily','weekly')),
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists events_starts_idx on public.events (starts_at);

-- ---------- claude_status: one row per machine ----------
create table if not exists public.claude_status (
  machine     text primary key check (machine in ('mac', 'pc')),
  owner       text not null,
  state       text not null default 'idle' check (state in ('idle', 'working')),
  project     text,
  last_task   text,
  updated_at  timestamptz not null default now()
);

insert into public.claude_status (machine, owner, state) values
  ('mac', 'ethan', 'idle'), ('pc', 'justin', 'idle')
on conflict (machine) do nothing;

-- Realtime broadcast for both tables
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.claude_status;
