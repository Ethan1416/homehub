-- Lightweight per-user separation. Not auth/security — just lets two people
-- (Ethan + Justin) each have their own progress, gym overrides, and Oura data.

alter table public.progress
  add column if not exists user_id text not null default 'ethan';
alter table public.gym_override
  add column if not exists user_id text not null default 'ethan';
alter table public.health_daily
  add column if not exists user_id text not null default 'ethan';

-- repoint primary keys so the same date/event/item can be logged by two people
alter table public.progress drop constraint if exists progress_pkey;
alter table public.progress
  add constraint progress_pkey primary key (event_id, log_date, item_key, user_id);

alter table public.gym_override drop constraint if exists gym_override_pkey;
alter table public.gym_override
  add constraint gym_override_pkey primary key (log_date, user_id);

alter table public.health_daily drop constraint if exists health_daily_pkey;
alter table public.health_daily
  add constraint health_daily_pkey primary key (day, user_id);
