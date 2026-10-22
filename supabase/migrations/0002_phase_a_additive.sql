-- Phase A: add the new structure alongside the old one.
-- Safe while the current app is live: nothing the old code reads or writes is removed or tightened.
--
-- organizations   one row per company or agency behind a project (shared reference data)
-- lead_actions    one row per user per lead: that user's stage, watching and not-relevant choices
-- opportunities   gains organization_id (who owns it) and discovered_by (who found it)
-- outreach_drafts gains user_id (whose draft it is)

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  owner_type text not null default 'Unclear' check (owner_type in ('Private', 'Public', 'Unclear')),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table opportunities add column if not exists organization_id uuid references organizations (id) on delete set null;
alter table opportunities add column if not exists discovered_by uuid references auth.users (id) on delete set null;
alter table opportunities alter column owner drop not null;
create index if not exists opportunities_organization_id_idx on opportunities (organization_id);
create index if not exists opportunities_discovered_by_idx on opportunities (discovered_by);

-- Turn the owner names already on the leads into organization rows, then link each lead to its row.
insert into organizations (name, owner_type)
select o.owner,
       case when o.owner ~* '(city of|town of|county of|municipal|government of|province of|ministry|department of|regulator|commission)'
            then 'Public' else 'Private' end
from (
  select distinct owner from opportunities
  where in_scan and owner is not null and owner <> 'Not identified in headline'
) o
on conflict (name) do nothing;

update opportunities o
set organization_id = g.id
from organizations g
where g.name = o.owner and o.organization_id is null;

create table if not exists lead_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  opportunity_id text not null references opportunities (id) on delete cascade,
  stage text check (stage in ('spotted', 'reviewing', 'outreach', 'pipeline')),
  watched boolean not null default false,
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);
create index if not exists lead_actions_opportunity_id_idx on lead_actions (opportunity_id);

alter table outreach_drafts add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table outreach_drafts alter column user_id set default auth.uid();
create unique index if not exists outreach_drafts_user_opportunity_key on outreach_drafts (user_id, opportunity_id);

-- Row Level Security for the new tables.
alter table organizations enable row level security;
alter table lead_actions enable row level security;

drop policy if exists "signed-in users read organizations" on organizations;
create policy "signed-in users read organizations" on organizations
  for select to authenticated using (true);

drop policy if exists "signed-in users add organizations" on organizations;
create policy "signed-in users add organizations" on organizations
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "users read their own actions" on lead_actions;
create policy "users read their own actions" on lead_actions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "users add their own actions" on lead_actions;
create policy "users add their own actions" on lead_actions
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "users change their own actions" on lead_actions;
create policy "users change their own actions" on lead_actions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users remove their own actions" on lead_actions;
create policy "users remove their own actions" on lead_actions
  for delete to authenticated using (auth.uid() = user_id);
