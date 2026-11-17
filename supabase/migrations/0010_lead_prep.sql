-- The prep agent's work.
--
-- Each day the agent picks a few of the best new leads and does the first steps of the job itself: it checks the lead is
-- not a duplicate of one already being worked, researches it on the web, and drafts an outreach email. One row here is
-- the result for one lead, including a plain list of the steps it took, so a person can see exactly what it did.
--
-- Everything in it comes from public records and web pages, so every signed-in person can read it. Nobody can write to
-- it from the app: only the server's agent, using a key that bypasses these rules. It never sends anything. A person
-- reviews the draft and decides.

create table if not exists lead_prep (
  opportunity_id text primary key references opportunities (id) on delete cascade,
  -- working: the agent has picked it up. ready: research and draft are done and waiting for a person.
  -- skipped_duplicate: another lead about the same project is already being handled.
  -- skipped_nothing_found: the web research found no owner, contractor or person worth writing to.
  status text not null check (status in ('working', 'ready', 'skipped_duplicate', 'skipped_nothing_found')),
  -- What the web research found: the same shape as "Research this lead" (every item carries its quote and link).
  findings jsonb check (findings is null or pg_column_size(findings) < 60000),
  -- The drafted email: subject_a, subject_b, body, linkedin_note, tone, angle, recipient (name, role, company, evidence).
  draft jsonb check (draft is null or pg_column_size(draft) < 12000),
  -- The agent's own record of what it did and why: a list of { step, ok, note }.
  steps jsonb not null default '[]'::jsonb check (pg_column_size(steps) < 12000),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists lead_prep_status_created_idx on lead_prep (status, created_at desc);

alter table lead_prep enable row level security;
drop policy if exists "signed-in people read lead prep" on lead_prep;
create policy "signed-in people read lead prep" on lead_prep
  for select to authenticated using (true);
