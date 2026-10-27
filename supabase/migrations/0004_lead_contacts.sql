-- Saved contacts: the people a user has found on a lead, for the project chain and the CSV export.
--
-- One row is one person a signed-in user saved against one lead (name, role, company, optional
-- LinkedIn link, a note). Contacts are private to the person who saved them: nobody else can read
-- or change them. The app never fills this table itself; a person types in what they found.
-- No seed data is loaded, so the table holds no real people unless a user adds them.

create table if not exists lead_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  opportunity_id text not null references opportunities (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  role text,
  company text,
  linkedin_url text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists lead_contacts_user_opportunity_idx on lead_contacts (user_id, opportunity_id);
create index if not exists lead_contacts_opportunity_id_idx on lead_contacts (opportunity_id);

alter table lead_contacts enable row level security;

drop policy if exists "users read their own contacts" on lead_contacts;
create policy "users read their own contacts" on lead_contacts
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "users add their own contacts" on lead_contacts;
create policy "users add their own contacts" on lead_contacts
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "users change their own contacts" on lead_contacts;
create policy "users change their own contacts" on lead_contacts
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users remove their own contacts" on lead_contacts;
create policy "users remove their own contacts" on lead_contacts
  for delete to authenticated using (auth.uid() = user_id);
