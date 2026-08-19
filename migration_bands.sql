-- ============================================================
-- Bands, measurement types, and off-plan logging
-- ============================================================

-- 1. The bands you own. Ordered lightest to heaviest via sort_order, which
--    is what lets the app tell that one band is a step up from another.
--    resistance is the figure printed on the band and is optional - unmarked
--    bands still work, ordered by position alone.
create table if not exists public.bands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  colour text not null default '#8FBF7A',
  resistance numeric,
  resistance_unit text check (resistance_unit in ('kg','lb')) default 'lb',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.bands enable row level security;

drop policy if exists "bands_own_rows" on public.bands;
create policy "bands_own_rows" on public.bands
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists bands_user_order on public.bands (user_id, sort_order);

-- 2. How an exercise is measured. Null is treated as 'weight' so every
--    existing exercise keeps working untouched.
alter table public.exercise_master
  add column if not exists measurement_type text
  check (measurement_type in ('weight','band','bodyweight','time','distance'));

alter table public.exercises
  add column if not exists measurement_type text
  check (measurement_type in ('weight','band','bodyweight','time','distance'));

-- 3. What a band set actually recorded.
--
--    band_snapshot deliberately COPIES the label, colour and resistance of
--    the band(s) used at the moment of logging rather than only referencing
--    the band row. If the user later corrects a band's printed rating, or
--    loses a band and deletes it, historical sets must keep saying what they
--    said at the time - history silently rewriting itself underneath the
--    user is a bug this app has been bitten by before.
--
--    band_resistance is the combined nominal figure (summed when bands are
--    stacked) and is what PR ordering and estimated volume use.
alter table public.sets
  add column if not exists measurement_type text
  check (measurement_type in ('weight','band','bodyweight','time','distance')),
  add column if not exists band_snapshot jsonb,
  add column if not exists band_resistance numeric,
  add column if not exists band_resistance_unit text check (band_resistance_unit in ('kg','lb')),
  add column if not exists duration_seconds integer,
  add column if not exists distance_value numeric,
  add column if not exists distance_unit text;

-- 4. Off-plan sets. A set logged without the exercise being attached to a
--    weekday - the "dayless" case. Sessions themselves are derived by
--    grouping sets on (logged_at, location_id), so no session table is
--    needed; this flag only marks that the set did not come from a plan.
alter table public.sets
  add column if not exists off_plan boolean not null default false;

-- 5. Location ordering and archiving. Sorting by last use lets a place you
--    trained at once sink below your regulars without the user having to
--    declare upfront whether it was a one-off.
alter table public.locations
  add column if not exists last_used_at timestamptz,
  add column if not exists archived boolean not null default false;
