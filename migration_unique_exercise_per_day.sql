-- Makes same-day duplicates physically impossible at the database level,
-- rather than relying on app code remembering to check first. Only applies
-- to active exercises, so deactivated/cleaned-up duplicates from before this
-- don't block anything.
--
-- IMPORTANT: run "Clean Up Duplicates" in the app FIRST if you haven't
-- already - this constraint will fail to create if any active duplicates
-- still exist in your data right now.
create unique index if not exists unique_active_exercise_per_day
  on exercises (user_id, weekday, lower(name))
  where active = true;
