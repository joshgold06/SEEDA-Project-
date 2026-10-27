-- Saved views: a named combination of filters (provinces, industries, minimum score and so on)
-- that a person saves to bring back with one click, such as "Ontario mining" or "BC energy 65+".
--
-- One row is one saved view belonging to one signed-in user. The filters are stored as a small
-- JSON object; the app checks every value when it reads it back. Views are private: nobody else
-- can read or change them. Saving a view with a name you already used replaces that view.

create table if not exists saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0 and length(name) <= 60),
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table saved_views enable row level security;

drop policy if exists "users read their own views" on saved_views;
create policy "users read their own views" on saved_views
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "users add their own views" on saved_views;
create policy "users add their own views" on saved_views
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "users change their own views" on saved_views;
create policy "users change their own views" on saved_views
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users remove their own views" on saved_views;
create policy "users remove their own views" on saved_views
  for delete to authenticated using (auth.uid() = user_id);
