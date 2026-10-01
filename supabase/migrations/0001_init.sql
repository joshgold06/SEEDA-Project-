-- Signal Scout schema: opportunities + outreach drafts.
-- Run this once in the Supabase SQL Editor (or `supabase db push`).

create table if not exists opportunities (
  id text primary key,
  ref text not null,
  type text not null,
  score int not null,
  title text not null,
  full_title text,
  owner text not null,
  location text not null,
  timing text not null,
  timing_icon text not null default 'calendar',
  days_left int,
  phase_tag text not null,
  in_scan boolean not null default true,
  stage text check (stage in ('spotted', 'reviewing', 'outreach', 'pipeline')),
  watched boolean not null default false,
  dismissed boolean not null default false,
  value numeric,
  category text,
  source_id text,
  deadline_text text,
  overview text,
  insight text,
  match_percent int,
  relevance jsonb,
  involved jsonb,
  project_type jsonb,
  scale jsonb,
  current_stage jsonb,
  documents jsonb,
  service_line text,
  pipeline_time text,
  pipeline_note text,
  pipeline_tags text[],
  assignee text not null default 'SM',
  contact_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists outreach_drafts (
  opportunity_id text primary key references opportunities(id) on delete cascade,
  subject text not null,
  body text not null,
  tone text not null check (tone in ('Direct', 'Warm', 'Technical')),
  updated_at timestamptz not null default now()
);

-- Single-tenant prototype, no auth yet: allow the anon (public) role full
-- read/write access via RLS rather than leaving the tables unprotected.
alter table opportunities enable row level security;
alter table outreach_drafts enable row level security;

create policy "public read opportunities" on opportunities for select using (true);
create policy "public write opportunities" on opportunities for insert with check (true);
create policy "public update opportunities" on opportunities for update using (true) with check (true);

create policy "public read drafts" on outreach_drafts for select using (true);
create policy "public write drafts" on outreach_drafts for insert with check (true);
create policy "public update drafts" on outreach_drafts for update using (true) with check (true);

-- Seed data, mirrors lib/data.ts SEED_OPPORTUNITIES so a fresh database
-- renders the same demo state as the local-storage version did.
insert into opportunities (
  id, ref, type, score, title, full_title, owner, location, timing, timing_icon,
  days_left, phase_tag, in_scan, stage, watched, dismissed, value, category,
  source_id, deadline_text, overview, insight, match_percent, relevance,
  involved, project_type, scale, current_stage, documents, service_line,
  pipeline_time, pipeline_note, pipeline_tags, assignee, contact_role
) values
(
  'bow-river-wtp', 'OPP-2026-041', 'Tender', 94, 'Bow River Water Treatment Plant',
  'Bow River Water Treatment Plant Expansion', 'City of Calgary', 'Calgary, AB',
  'Closes in 9 days', 'calendar', 9, 'Tender', true, 'outreach', false, false,
  42000000, 'Water Treatment', 'CT-8841', 'October 3, 2026',
  'The City of Calgary is seeking qualified partners for a major expansion of the Bow River Water Treatment Plant, including new high-rate clarification and filtration capacity.',
  'A strong match for your municipal treatment track record, with a clear opening through the technical design scope.',
  94,
  '[{"text":"Municipal water treatment experience","kind":"match","strong":" aligns directly"},{"text":"Project scale fits target profile","kind":"match"},{"text":"Alberta registration required","kind":"constraint"},{"text":"Submission deadline is approaching","kind":"constraint"}]'::jsonb,
  '{"primary":"City of Calgary","secondary":"Owner and procurement authority"}'::jsonb,
  '{"primary":"Design-build","secondary":"Treatment capacity expansion"}'::jsonb,
  '{"primary":"$42M estimated","secondary":"220 ML/day additional capacity"}'::jsonb,
  '{"primary":"Open tender","secondary":"Questions due September 27"}'::jsonb,
  '[{"name":"Tender_Requirements.pdf","kind":"pdf"},{"name":"Site_Information.doc","kind":"doc"}]'::jsonb,
  'Water Infrastructure', 'Updated 2m ago', null, array['RFP', 'Priority'], 'SM', 'Procurement team'
),
(
  'red-deer-reuse', 'OPP-2026-039', 'Grant', 88, 'Red Deer Water Reuse Program', null,
  'City of Calgary', 'Calgary, AB', 'Closes in 18 days', 'calendar', 18, 'Funding',
  true, 'reviewing', false, false, 12500000, 'Water Reuse', 'AB-GW-221',
  'October 12, 2026',
  'A regional funding opportunity supporting water reuse and conservation infrastructure across central Alberta.',
  'Your reuse feasibility work makes this a credible partnership lead.', 88,
  '[{"text":"Water reuse is a stated priority","kind":"match"},{"text":"Regional delivery partner needed","kind":"match"},{"text":"Matching funds required","kind":"constraint"}]'::jsonb,
  '{"primary":"Red Deer County","secondary":"Regional program sponsor"}'::jsonb,
  '{"primary":"Grant program","secondary":"Reuse feasibility and pilots"}'::jsonb,
  '{"primary":"$12.5M program","secondary":"Multiple regional sites"}'::jsonb,
  '{"primary":"Expressions of interest","secondary":"Applications accepted"}'::jsonb,
  '[{"name":"Program_Guide.pdf","kind":"pdf"}]'::jsonb,
  'Advisory', 'Updated 1h ago', null, null, 'SM', null
),
(
  'fort-mcmurray-pump', 'OPP-2026-037', 'RFQ', 76, 'Fort McMurray Pump Station Upgrade', null,
  'City of Calgary', 'Calgary, AB', 'Posted 3 hours ago', 'calendar', null, 'Early Stage',
  true, 'spotted', false, false, 6800000, 'Wastewater', 'RM-1029', 'November 4, 2026',
  'Prequalification for engineering and construction services related to a lift station modernization program.',
  'Worth watching while the procurement path becomes clearer.', 76,
  '[{"text":"Strong wastewater fit","kind":"match"},{"text":"Procurement scope is not yet defined","kind":"constraint"}]'::jsonb,
  '{"primary":"Regional Municipality of Wood Buffalo","secondary":"Municipal owner"}'::jsonb,
  '{"primary":"Prequalification","secondary":"Pump station upgrades"}'::jsonb,
  '{"primary":"$6.8M estimated","secondary":"Three lift stations"}'::jsonb,
  '{"primary":"RFQ posted","secondary":"Prequalification phase"}'::jsonb,
  '[{"name":"RFQ_Notice.pdf","kind":"pdf"}]'::jsonb,
  'Wastewater', 'Updated 3h ago', null, null, 'SM', null
),
(
  'lethbridge-biosolids', 'OPP-2026-034', 'News', 67, 'Lethbridge Biosolids Facility', null,
  'City of Calgary', 'Calgary, AB', 'Posted yesterday', 'calendar', null, 'Market Signal',
  true, null, false, false, 18000000, 'Biosolids', 'NEWS-441', null,
  'Council has approved preliminary planning for a new biosolids processing facility.',
  'An early signal to monitor before a formal procurement appears.', 67,
  null, null, null, null, null, null,
  'Environmental Services', 'Updated 1d ago', null, null, 'SM', null
),
(
  'medicine-hat-network', 'OPP-2026-031', 'Tender', 91, 'Medicine Hat Distribution Network', null,
  'City of Calgary', 'Calgary, AB', 'Closes in 5 days', 'calendar', 5, 'Tender',
  true, 'pipeline', false, false, 9700000, 'Distribution', 'MH-7752', 'September 29, 2026',
  'Water distribution network rehabilitation and pressure management improvements.',
  'A late-stage opportunity with a tight submission window.', 91,
  null, null, null, null, null, null,
  'Water Infrastructure', 'Sent 2h ago', 'Outreach Sent', array['RFP'], 'SM', 'Infrastructure director'
)
on conflict (id) do nothing;

insert into outreach_drafts (opportunity_id, subject, body, tone, updated_at)
values (
  'bow-river-wtp',
  'Interest in Bow River Water Treatment Plant',
  E'Hello Procurement team,\n\nI hope you are well. I am reaching out regarding the Bow River Water Treatment Plant opportunity (OPP-2026-041). Our team has relevant experience in Water Infrastructure, and we would welcome a short conversation about how we could support the next phase.\n\nWould you be open to a 20-minute technical brief next week?\n\nBest,\nSarah Mitchell',
  'Warm',
  now() - interval '2 minutes'
)
on conflict (opportunity_id) do nothing;
