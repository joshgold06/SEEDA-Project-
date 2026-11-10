-- Settings: one row per person holding their lead preferences (which kinds of lead to show, how old,
-- default provinces and minimum score) and their outreach defaults (tone, pitch angle, signature,
-- company line). They are kept with the account, so they follow the person to any device.
--
-- A row holds only those choices as JSON. It never holds lead data, drafts or anything about anyone
-- else. Rows are private: a person can read, add, change and remove only their own.

create table if not exists user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (pg_column_size(settings) < 8000),
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;

drop policy if exists "users read their own settings" on user_settings;
create policy "users read their own settings" on user_settings
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "users add their own settings" on user_settings;
create policy "users add their own settings" on user_settings
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "users change their own settings" on user_settings;
create policy "users change their own settings" on user_settings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users remove their own settings" on user_settings;
create policy "users remove their own settings" on user_settings
  for delete to authenticated using (auth.uid() = user_id);
