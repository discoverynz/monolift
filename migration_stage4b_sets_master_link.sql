-- STAGE 4b of the rebuild. Adds a NEW column to sets, pointing at
-- exercise_master, without touching the existing exercise_id column at all.
-- The old column stays completely intact as a safety net - if anything ever
-- went wrong with this new column, every set's original link is still there,
-- untouched, exactly as it is right now.
alter table sets add column if not exists exercise_master_id uuid references exercise_master(id);
create index if not exists idx_sets_exercise_master on sets(exercise_master_id);
