-- Adds pause/resume support to phase_settings.
--
-- paused_at holds the date the user paused their bulk/cut cycle (null =
-- not paused). Pausing deliberately does NOT modify the phase dates - it
-- just records when the pause started. On resume, every phase date is
-- shifted forward by however many days the pause lasted, so the user picks
-- up exactly where they left off: someone who pauses in Week 6 of 8 comes
-- back to Week 6 of 8, not Week 8 with two weeks silently burned.
--
-- Storing the pause date (rather than a boolean) is what makes that shift
-- computable, and means a pause survives the user not opening the app for
-- the entire duration of it.
alter table public.phase_settings
  add column if not exists paused_at date;
