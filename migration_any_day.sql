-- The Anytime slot is stored as weekday 7, which lets it flow through every
-- existing query path instead of needing a parallel one. The database check
-- constraints were written when only 0-6 existed, so they reject it.
--
-- Widening to 0-7 rather than dropping the constraint entirely - the point of
-- the check is to catch genuinely bad values, and 8 is still bad.

alter table public.exercise_days
  drop constraint if exists exercise_days_weekday_check;
alter table public.exercise_days
  add constraint exercise_days_weekday_check check (weekday >= 0 and weekday <= 7);

alter table public.exercises
  drop constraint if exists exercises_weekday_check;
alter table public.exercises
  add constraint exercises_weekday_check check (weekday >= 0 and weekday <= 7);

-- day_types holds the per-day label. The Anytime slot can carry one too, so
-- the same widening applies.
alter table public.day_types
  drop constraint if exists day_types_weekday_check;
alter table public.day_types
  add constraint day_types_weekday_check check (weekday >= 0 and weekday <= 7);
