create table if not exists plan_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  snapshot jsonb not null
);
alter table plan_backups enable row level security;
create policy "Users manage their own plan backups" on plan_backups
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
