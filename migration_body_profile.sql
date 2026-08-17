-- Adds the two profile values needed to estimate body composition from tape
-- measurements. Both are optional - every insight that needs them is gated
-- on their presence and simply doesn't render otherwise.
--
-- height_cm: required by the US Navy circumference method, which is the
-- standard way to turn a waist/neck (and hip) measurement into a body-fat
-- estimate without calipers or a DEXA scan.
--
-- bf_formula: which variant of that method to use. The Navy method has two
-- forms with different inputs - the 'male' variant uses waist and neck, the
-- 'female' variant additionally requires hip. Stored as a formula choice
-- rather than as an identity field, because that is genuinely all the app
-- uses it for.
alter table public.phase_settings
  add column if not exists height_cm numeric,
  add column if not exists bf_formula text check (bf_formula in ('male','female'));
