-- Ordered roadmap milestones (e.g. PassEPPP launch path).
create table if not exists public.milestones (
  id          text primary key,
  position    int not null,
  title       text not null,
  description text,
  status      text not null default 'pending'
              check (status in ('pending','active','done')),
  updated_at  timestamptz not null default now()
);
create index if not exists milestones_pos_idx on public.milestones (position);

alter table public.milestones enable row level security;
drop policy if exists milestones_read on public.milestones;
create policy milestones_read on public.milestones
  for select to anon using (true);
-- writes only via the Edge Function (service role)

alter publication supabase_realtime add table public.milestones;

-- Seed
insert into public.milestones (id, position, title, description, status) values
  ('sample-questions',  1, 'Generating sample questions for approval',
     'Producing the initial question set for Justin to approve before scaling up.', 'active'),
  ('question-bank',     2, 'Generate all mock exam, fundamental & enrichment questions',
     'Full content pass once the sample set is approved.', 'pending'),
  ('admin-features',    3, 'Develop admin features',
     'Internal tooling for question management, user moderation, analytics.', 'pending'),
  ('final-testing',     4, 'Final testing before launch',
     'End-to-end QA, load testing, payment + auth flows, cross-device checks.', 'pending'),
  ('launch',            5, 'Launch PassEPPP website',
     'Public launch.', 'pending')
on conflict (id) do nothing;
