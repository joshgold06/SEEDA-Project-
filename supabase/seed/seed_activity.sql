-- Synthetic activity for the assignment's test account.
--
-- The leads and companies are real (public news headlines, collected by the app's searches).
-- What is invented here is one person's activity on them: which leads they shortlisted, watched
-- or dismissed, and the outreach drafts they wrote. That is what a signed-in person sees on the
-- Shortlist, Pipeline and Morning Scan screens.
--
-- How to use: create the test account in the app first, put its email on the line marked EDIT,
-- then run the whole script in the Supabase SQL editor.
--
-- Wipe and reload: running it again removes this one account's activity first, then recreates it,
-- so it can be re-run any time. It never touches other people's rows, leads or companies.

do $$
declare
  me uuid := (select id from auth.users where email = 'TEST_ACCOUNT_EMAIL'); -- EDIT: the test account's email
begin
  if me is null then
    raise exception 'No account has that email. Create the test account in the app first, then edit the email near the top of this script.';
  end if;

  delete from outreach_drafts where user_id = me;
  delete from lead_actions where user_id = me;

  -- Rank every visible lead by score. The 14 best are worked through the pipeline, the next
  -- 10 are watched, and the 15 weakest are marked not relevant. The rest are left untouched,
  -- as a real user would leave most of a long list.
  insert into lead_actions (user_id, opportunity_id, stage, watched, dismissed, created_at, updated_at)
  select me,
         ranked.id,
         case when rn <= 5 then 'spotted'
              when rn <= 9 then 'reviewing'
              when rn <= 12 then 'outreach'
              when rn <= 14 then 'pipeline' end,
         (rn <= 14 and rn % 2 = 1) or (rn between 15 and 24),
         rn > total - 15,
         now() - (rn * interval '9 hours'),
         now() - (rn * interval '7 hours')
  from (
    select id,
           row_number() over (order by score desc, id) as rn,
           count(*) over () as total
    from opportunities
    where in_scan
  ) ranked
  where rn <= 24 or rn > total - 15;

  -- A drafted message for every lead that reached the outreach or pipeline stage, in the same
  -- wording the app's draft generator uses, with the tone varying.
  insert into outreach_drafts (user_id, opportunity_id, subject, body, tone, updated_at)
  select me,
         a.opportunity_id,
         case when g.name is not null then 'Specialist support for ' || g.name || '''s work'
              else 'Specialist support for your project' end,
         E'Hello,\n\nI hope you are well. I am reaching out about a recent news report: "' || o.title
           || E'".\n\nSEEDA''s EPCMst network connects project teams with pre-vetted specialists for short-term, targeted input. It is meant for teams that already cover most of what they need and want the remaining expertise without a long engagement. We have experience in '
           || coalesce(o.service_line, 'engineering, procurement and construction')
           || E'.\n\nWould you be open to a short conversation about where outside specialist input could help?\n\nBest,\nTest Account',
         (array['Warm', 'Direct', 'Technical'])[1 + (row_number() over (order by a.opportunity_id))::int % 3],
         a.updated_at
  from lead_actions a
  join opportunities o on o.id = a.opportunity_id
  left join organizations g on g.id = o.organization_id
  where a.user_id = me and a.stage in ('outreach', 'pipeline');
end $$;
