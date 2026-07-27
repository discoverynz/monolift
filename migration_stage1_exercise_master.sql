-- STAGE 1 of the exercises rebuild - purely additive, changes nothing about
-- how the app currently works. Creates two new, empty tables. Nothing reads
-- from or writes to them yet - the live app keeps using the existing
-- "exercises" table exactly as before. Safe to run any time.
--
-- exercise_master: one row per LOGICAL exercise (e.g. one "Bench Press" row,
-- not one per day it appears on). This is where the real exercise-level data
-- will eventually live: name, category, alt group, tags, muscle override.
create table if not exists exercise_master (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null,
  category text,
  alt_group_id uuid references alt_groups(id),
  push_pull text,
  upper_lower text,
  muscle_override text,
  location_ids uuid[],
  created_at timestamptz default now()
);
alter table exercise_master enable row level security;
create policy "Users manage their own exercise_master rows" on exercise_master
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- exercise_days: which weekdays a given master exercise appears on. This
-- replaces the current per-day duplication - one master exercise can have
-- many rows here (one per day) instead of many separate exercise rows.
create table if not exists exercise_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  exercise_master_id uuid not null references exercise_master(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  created_at timestamptz default now(),
  unique (exercise_master_id, weekday)
);
alter table exercise_days enable row level security;
create policy "Users manage their own exercise_days rows" on exercise_days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_exercise_days_master on exercise_days(exercise_master_id);
create index if not exists idx_exercise_days_weekday on exercise_days(user_id, weekday);
