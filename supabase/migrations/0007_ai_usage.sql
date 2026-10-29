-- AI usage: one row each time a person asks the AI to write an email, so the app can cap how many
-- drafts one person can start per day and keep the AI plan's bill predictable.
--
-- A row holds only who asked, what kind of request it was and when. It never stores the email
-- itself or any lead details. Rows are private: a person can see and add only their own, and
-- nobody can change or remove them.

create table if not exists ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (length(kind) between 1 and 40),
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_created_idx on ai_usage (user_id, created_at desc);

alter table ai_usage enable row level security;

drop policy if exists "users read their own ai usage" on ai_usage;
create policy "users read their own ai usage" on ai_usage
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "users add their own ai usage" on ai_usage;
create policy "users add their own ai usage" on ai_usage
  for insert to authenticated with check (auth.uid() = user_id);
