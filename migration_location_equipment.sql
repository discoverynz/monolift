-- Environments feature: track which equipment each location actually has,
-- so exercises can be filtered to what's genuinely available there.
alter table locations add column if not exists equipment_tags text[] default '{}';
