-- STAGE 4c prep. Sets logged after switching to the new structure will only
-- have exercise_master_id populated, not the old exercise_id - there's no
-- meaningful old-style per-day exercise row to point them at anymore. This
-- just makes that column optional going forward; every existing set's
-- exercise_id is completely untouched.
alter table sets alter column exercise_id drop not null;
