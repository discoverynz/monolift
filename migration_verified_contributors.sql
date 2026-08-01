-- Verified Contributors: locks down who can add to the shared Zealift
-- exercise database. Only users approved by the app owner (verified here)
-- can contribute - everyone can still read the whole database regardless.

create table if not exists verified_contributors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  verified_at timestamptz default now()
);
alter table verified_contributors enable row level security;

-- Anyone signed in can check who's verified (needed client-side to show/hide
-- the contribute flow correctly), but only the app owner can add new rows -
-- there's no self-approval path.
create policy "Anyone authenticated can read the verified list" on verified_contributors
  for select using (auth.role() = 'authenticated');
create policy "Only the app owner can approve new contributors" on verified_contributors
  for insert with check (auth.uid() = '08a8e277-f4e0-4b8f-a466-5f7b72e4dfc1');
create policy "Only the app owner can remove a contributor" on verified_contributors
  for delete using (auth.uid() = '08a8e277-f4e0-4b8f-a466-5f7b72e4dfc1');

-- Replace the old "anyone can insert" policy on the shared exercise database
-- with one that requires verification first.
drop policy if exists "Any authenticated user can contribute a new exercise" on zealift_exercise_db;
create policy "Only verified contributors can add exercises" on zealift_exercise_db
  for insert with check (
    auth.uid() = contributed_by
    and exists (select 1 from verified_contributors where user_id = auth.uid())
  );

-- Auto-verifies the app owner (Joel) so his own contributions never need
-- separate approval.
insert into verified_contributors (user_id) values ('08a8e277-f4e0-4b8f-a466-5f7b72e4dfc1')
on conflict (user_id) do nothing;

-- Lets the app owner approve a contributor by email from inside the app,
-- without needing to run SQL by hand each time. auth.users isn't directly
-- queryable from the client, so this looks the email up server-side. The
-- owner check happens inside the function itself, so it's safe to expose to
-- any authenticated caller - anyone else calling it just gets rejected.
create or replace function approve_contributor_by_email(target_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  if auth.uid() <> '08a8e277-f4e0-4b8f-a466-5f7b72e4dfc1' then
    return 'not_authorized';
  end if;
  select id into target_id from auth.users where lower(email) = lower(target_email);
  if target_id is null then
    return 'user_not_found';
  end if;
  insert into verified_contributors (user_id) values (target_id) on conflict (user_id) do nothing;
  return 'approved';
end;
$$;
