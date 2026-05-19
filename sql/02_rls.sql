-- RLS. Design: the PWA has no login (private household, obscure URL), so the
-- anon key may read/write the calendar. claude_status is READ-only to the
-- public client; writes happen only via the secured Edge Function (service role),
-- so a random visitor cannot spoof Claude activity.

alter table public.events enable row level security;
alter table public.claude_status enable row level security;

-- events: anon full access (household calendar)
drop policy if exists events_all on public.events;
create policy events_all on public.events
  for all to anon using (true) with check (true);

-- claude_status: anon read-only
drop policy if exists claude_read on public.claude_status;
create policy claude_read on public.claude_status
  for select to anon using (true);
-- (no anon insert/update/delete — Edge Function uses the service role key)
