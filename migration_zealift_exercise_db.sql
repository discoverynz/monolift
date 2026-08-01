-- Zealift Database: a shared, cross-user exercise library separate from the
-- public free-exercise-db. Any authenticated user can read the whole thing
-- and contribute new exercises to it - it's meant to grow as more people use
-- the app, covering gym-specific machines and variants the public database
-- doesn't have.
create table if not exists zealift_exercise_db (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  primary_muscle text,
  secondary_muscles text[] default '{}',
  equipment text,
  mechanic text,
  level text,
  instructions text,
  contributed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);
alter table zealift_exercise_db enable row level security;
create policy "Any authenticated user can read the shared exercise database" on zealift_exercise_db
  for select using (auth.role() = 'authenticated');
create policy "Any authenticated user can contribute a new exercise" on zealift_exercise_db
  for insert with check (auth.uid() = contributed_by);
-- Prevents the same exercise name being contributed twice (case-insensitive).
create unique index if not exists zealift_exercise_db_name_unique on zealift_exercise_db (lower(name));
