-- Phase B: lock the database down to match the new schema.
-- Run this ONLY after the app version that reads lead_actions and organizations is deployed
-- and checked. It removes the old shared columns and the rules that let anyone read and write.
--
-- Who may do what after this:
--   opportunities    signed-in users read shared leads (and their own manual ones), add leads
--                    they found, and change only the leads they found
--   organizations    signed-in users read all, and add new ones (nobody edits or deletes)
--   lead_actions     each user reads and changes only their own rows
--   outreach_drafts  each user reads and changes only their own rows

-- 1. Drafts belong to one user. The two existing demo drafts have no owner, so nobody could
--    ever open them; remove them rather than guess an owner.
delete from outreach_drafts where user_id is null;
alter table outreach_drafts alter column user_id set not null;
alter table outreach_drafts drop constraint outreach_drafts_pkey;
alter table outreach_drafts
  add constraint outreach_drafts_pkey primary key using index outreach_drafts_user_opportunity_key;

drop policy if exists "public read drafts" on outreach_drafts;
drop policy if exists "public write drafts" on outreach_drafts;
drop policy if exists "public update drafts" on outreach_drafts;

drop policy if exists "users read their own drafts" on outreach_drafts;
create policy "users read their own drafts" on outreach_drafts
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "users add their own drafts" on outreach_drafts;
create policy "users add their own drafts" on outreach_drafts
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "users change their own drafts" on outreach_drafts;
create policy "users change their own drafts" on outreach_drafts
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users remove their own drafts" on outreach_drafts;
create policy "users remove their own drafts" on outreach_drafts
  for delete to authenticated using (auth.uid() = user_id);

-- 2. Leads keep only facts about the lead. A person's stage, watching and not-relevant choices
--    now live in lead_actions, and the company name lives in organizations.
alter table opportunities
  drop column if exists stage,
  drop column if exists watched,
  drop column if exists dismissed,
  drop column if exists pipeline_note,
  drop column if exists pipeline_time,
  drop column if exists owner;

drop policy if exists "public read opportunities" on opportunities;
drop policy if exists "public write opportunities" on opportunities;
drop policy if exists "public update opportunities" on opportunities;

drop policy if exists "signed-in users read shared and own leads" on opportunities;
create policy "signed-in users read shared and own leads" on opportunities
  for select to authenticated using (in_scan or discovered_by = auth.uid());

drop policy if exists "signed-in users add leads they found" on opportunities;
create policy "signed-in users add leads they found" on opportunities
  for insert to authenticated with check (discovered_by = auth.uid());

drop policy if exists "finders change their own leads" on opportunities;
create policy "finders change their own leads" on opportunities
  for update to authenticated using (discovered_by = auth.uid()) with check (discovered_by = auth.uid());

-- Optional, run separately if you want the invented sample records gone for good rather than hidden:
-- delete from opportunities where not in_scan and discovered_by is null;
