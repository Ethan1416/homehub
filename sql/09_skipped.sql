-- Tri-state checklist items: done | skipped | (neither).
-- "Skipped" counts toward 'moved past' for the day's completion ratio so the
-- day can still finish at 100%, but is visually distinct from a real ✓.
alter table public.progress
  add column if not exists skipped boolean not null default false;

-- Sanity: a row can be done OR skipped, not both.
alter table public.progress drop constraint if exists progress_done_xor_skipped;
alter table public.progress add constraint progress_done_xor_skipped
  check (not (done and skipped));
