-- Adds automatic phase scheduling to phase_settings. The concrete date
-- columns (bulk_start/bulk_end/cut_start/cut_end) remain the single source
-- of truth used everywhere else in the app (hero card, weight-change stats,
-- timeline) - these new columns just describe HOW those dates were derived,
-- so the Edit Phase form can reopen in the right mode and, when auto_repeat
-- is on, the app can compute the next cycle's concrete dates once the
-- current cycle has fully elapsed.
alter table public.phase_settings
  add column if not exists schedule_mode text check (schedule_mode in ('auto','manual')) default 'manual',
  add column if not exists bulk_weeks integer,
  add column if not exists cut_weeks integer,
  add column if not exists auto_repeat boolean not null default false;
