-- Triggers and the daily brief.
--
-- lead_events:   one row each time something worth following happens to a lead: it is new, a new story about
--                the same project appears, a register moves it to a new stage, or a contractor is named.
-- lead_insights: the short AI summary of a lead, prepared ahead of time so it is waiting when someone opens it.
-- job_runs:      one row per automatic run, so the brief can say when it was last updated.
--
-- All three are built from public records, never from anything one person did, so every signed-in person can read
-- them. Nobody can write to them from the app: only the server's scheduled run and its own checks do, using a key
-- that bypasses these rules. That stops a signed-in person from posting a fake "trigger" that everyone would see.

create table if not exists lead_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id text not null references opportunities (id) on delete cascade,
  kind text not null check (kind in ('new_lead', 'new_story', 'stage_change', 'contractor_named')),
  title text not null check (length(title) between 1 and 300),
  detail text check (detail is null or length(detail) <= 600),
  link text check (link is null or link ~ '^https?://'),
  -- Makes a repeat run safe: the same thing happening again for the same lead is recorded once.
  dedupe_key text not null check (length(dedupe_key) between 1 and 200),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (opportunity_id, dedupe_key)
);
create index if not exists lead_events_occurred_idx on lead_events (occurred_at desc);
create index if not exists lead_events_opportunity_idx on lead_events (opportunity_id, occurred_at desc);

alter table lead_events enable row level security;
drop policy if exists "signed-in people read lead events" on lead_events;
create policy "signed-in people read lead events" on lead_events
  for select to authenticated using (true);

create table if not exists lead_insights (
  opportunity_id text primary key references opportunities (id) on delete cascade,
  summary jsonb not null check (pg_column_size(summary) < 8000),
  generated_at timestamptz not null default now()
);

alter table lead_insights enable row level security;
drop policy if exists "signed-in people read lead insights" on lead_insights;
create policy "signed-in people read lead insights" on lead_insights
  for select to authenticated using (true);

create table if not exists job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null check (length(job) between 1 and 60),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  summary jsonb check (summary is null or pg_column_size(summary) < 16000)
);
create index if not exists job_runs_job_started_idx on job_runs (job, started_at desc);

alter table job_runs enable row level security;
drop policy if exists "signed-in people read job runs" on job_runs;
create policy "signed-in people read job runs" on job_runs
  for select to authenticated using (true);
