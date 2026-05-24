-- Categorize events + multi-day weekly recurrence + per-set effort tagging.
alter table public.events
  add column if not exists type text not null default 'other'
    check (type in ('meal','gym','other')),
  add column if not exists days_of_week int[] default null;

alter table public.progress
  add column if not exists effort text
    check (effort in ('maxed','could_do_more'));

-- Auto-classify existing rows.
update public.events set type='gym'
  where (title like '%Gym%' or title like '🏋%') and type='other';

update public.events set type='meal' where type='other' and (
  title ilike '%breakfast%' or title ilike '%lunch%' or title ilike '%dinner%' or
  title ilike '%snack%' or title ilike '%post-workout%' or title ilike '%pre-workout%' or
  title ilike '%electrolyte%' or title like '🍳%' or title like '🥩%' or title like '🍽%'
);
