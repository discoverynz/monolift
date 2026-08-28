-- Optional door-anchor setup info for band exercises. A lot of resistance
-- band/tube work is anchored through a door - the anchor height/level
-- affects the angle and feel of the exercise, so it's worth recording
-- alongside the exercise itself (not the band, since the same band gets
-- anchored differently for different movements).
alter table public.exercise_master
  add column if not exists uses_door_anchor boolean not null default false,
  add column if not exists door_anchor_level text;

alter table public.exercises
  add column if not exists uses_door_anchor boolean not null default false,
  add column if not exists door_anchor_level text;
