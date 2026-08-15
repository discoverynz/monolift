-- Adds optional body-measurement fields to the body_weight table, so a single
-- weigh-in entry can carry tape-measurement data alongside the scale weight.
-- All columns are nullable/optional - only weight remains required. A single
-- measurement_unit column governs all measurement fields on that entry (cm or
-- in), independent of the weight's own kg/lb unit, since people often think
-- in one unit for the scale and another for the tape.
alter table public.body_weight
  add column if not exists measurement_unit text check (measurement_unit in ('cm','in')),
  add column if not exists neck numeric,
  add column if not exists chest numeric,
  add column if not exists waist numeric,
  add column if not exists hips numeric,
  add column if not exists left_arm numeric,
  add column if not exists right_arm numeric,
  add column if not exists left_thigh numeric,
  add column if not exists right_thigh numeric,
  add column if not exists left_calf numeric,
  add column if not exists right_calf numeric;
