-- Free-text notes per location. Hotel and travel gyms are unlabelled and
-- forgettable, and equipment tags only capture categories the app knows
-- about - not "2nd floor, key from reception, cable stack but no rope
-- attachment", which is the part actually worth remembering next year.
alter table public.locations
  add column if not exists notes text;
