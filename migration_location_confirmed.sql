-- Distinguishes "user explicitly chose Everywhere" from "nobody ever asked,
-- it just defaulted silently" - the exact ambiguity that let an exercise get
-- tagged to a single gym by accident with no visible sign anything had been
-- decided. Every existing row defaults to false, so the next time each
-- pre-existing exercise is actually logged, it gets the same explicit
-- confirmation new ones now require at creation - an organic backfill
-- rather than one giant wall of choices for every old exercise at once.
alter table public.exercise_master
  add column if not exists location_confirmed boolean not null default false;

alter table public.exercises
  add column if not exists location_confirmed boolean not null default false;
