-- Locations feature
create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);
alter table locations enable row level security;
create policy "Users manage their own locations" on locations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table exercises add column if not exists location_ids uuid[] default '{}';

-- Split/tagging feature
alter table exercises add column if not exists push_pull text;
alter table exercises add column if not exists upper_lower text;
