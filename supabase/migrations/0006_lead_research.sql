-- Lead research: what the "Research this lead" button found for one lead, and what the person
-- who ran it accepted or dismissed.
--
-- One row is one person's research on one lead. `findings` holds the owner, contractors and named
-- people the research found, each with the sentence it came from and a link to the page; `accepted`
-- holds the owner and contractors that person confirmed; `dismissed` lists findings they threw
-- away. Everything is private to the person who ran it. People the research finds are saved as
-- ordinary contacts (lead_contacts) only when the person accepts them.
--
-- researched_at is when the research last ran. The app uses it to cap how many researches one
-- person can start per day, which keeps the free search and AI plans from running out.

create table if not exists lead_research (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  opportunity_id text not null references opportunities (id) on delete cascade,
  findings jsonb not null default '{}'::jsonb,
  accepted jsonb not null default '{"owner": null, "contractors": []}'::jsonb,
  dismissed jsonb not null default '[]'::jsonb,
  researched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);
create index if not exists lead_research_opportunity_id_idx on lead_research (opportunity_id);

alter table lead_research enable row level security;

drop policy if exists "users read their own research" on lead_research;
create policy "users read their own research" on lead_research
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "users add their own research" on lead_research;
create policy "users add their own research" on lead_research
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "users change their own research" on lead_research;
create policy "users change their own research" on lead_research
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users remove their own research" on lead_research;
create policy "users remove their own research" on lead_research
  for delete to authenticated using (auth.uid() = user_id);
