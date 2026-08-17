-- Adds a directly-measured body fat percentage to each weigh-in, for users
-- with access to a DEXA scan, InBody, bioimpedance scale, calipers, or any
-- other method that reports a number directly.
--
-- This is deliberately separate from the tape-measurement estimate the app
-- can already compute. Where both exist for an entry, the measured value
-- wins: a real reading beats a circumference formula every time. The
-- estimate remains valuable as a fallback for entries and users that don't
-- have a measured number, so the two coexist rather than one replacing the
-- other.
alter table public.body_weight
  add column if not exists body_fat_pct numeric;
