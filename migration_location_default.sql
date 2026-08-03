-- Adds a database-backed fallback for the default location, since it was
-- previously stored only in localStorage which can be cleared by the OS
-- (a known issue with iOS home-screen PWAs in particular).
alter table public.locations
  add column if not exists is_default boolean not null default false;

-- Ensure at most one default per user (partial unique index - allows any
-- number of false rows, but only one true row per user_id).
create unique index if not exists locations_one_default_per_user
  on public.locations (user_id)
  where is_default = true;
