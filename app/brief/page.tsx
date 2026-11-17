"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarClock, ExternalLink, Loader2, Radio, RefreshCw, Sparkles } from "lucide-react";
import { ReadyForReview } from "@/components/ReadyForReview";
import { Breadcrumbs, Button, TopBar } from "@/components/ui";
import { useAuth } from "@/lib/AuthContext";
import type { Opportunity } from "@/lib/data";
import { getPreviousVisit, isNewSince } from "@/lib/lastVisit";
import { timeAgo } from "@/lib/outreach";
import { useStore } from "@/lib/store";
import { KIND_LABEL, usePreparedSummaries, useTriggerFeed } from "@/lib/triggers";
import { useAutoRefresh } from "@/lib/useAutoRefresh";
import { useWeights } from "@/lib/weights";

const href = (o: Opportunity) => (o.inScan ? `/scan/${o.id}` : `/shortlist/${o.id}`);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
const PAGE = 15;

function SectionTitle({ icon, title, note }: { icon: React.ReactNode; title: string; note: string }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-[14px] font-semibold">
        {icon}
        {title}
      </h2>
      <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">{note}</p>
    </div>
  );
}

/** Today's brief: what changed since the last automatic scan, so the work is already done when someone opens the app. */
export default function BriefPage() {
  const { user } = useAuth();
  const { opportunities, loaded } = useStore();
  const { scoreOf } = useWeights();
  const feed = useTriggerFeed();
  const refresh = useAutoRefresh(opportunities.length, false); // the daily scan does this work; here only the button starts one
  const [shown, setShown] = useState(PAGE);
  const previousVisit = user ? getPreviousVisit(user.id) : null;

  const byId = useMemo(() => new Map(opportunities.map((o) => [o.id, o])), [opportunities]);
  // Triggers only for leads this person can see (their settings and "not relevant" choices are respected).
  const triggers = useMemo(() => {
    const follows = (o: Opportunity) => o.stage !== null || o.watched;
    return feed.events
      .filter((e) => e.kind !== "new_lead" && byId.has(e.opportunityId) && !byId.get(e.opportunityId)!.dismissed)
      .map((e) => ({ e, lead: byId.get(e.opportunityId)!, followed: follows(byId.get(e.opportunityId)!) }))
      .sort((a, b) => Number(b.followed) - Number(a.followed) || b.e.createdAt.localeCompare(a.e.createdAt));
  }, [feed.events, byId]);

  const newLeads = useMemo(() => {
    const cutoff = previousVisit ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
    return opportunities
      .filter((o) => o.inScan && !o.dismissed && o.createdAt && o.createdAt > cutoff)
      .sort((a, b) => scoreOf(b) - scoreOf(a))
      .slice(0, 5);
  }, [opportunities, previousVisit, scoreOf]);
  const summaries = usePreparedSummaries(newLeads.map((o) => o.id));

  const closing = useMemo(
    () => opportunities.filter((o) => o.type === "Tender" && !o.dismissed && o.daysLeft != null && o.daysLeft > 0 && o.daysLeft <= 7).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)),
    [opportunities]
  );

  const run = feed.lastRun;
  const runNote = !feed.available
    ? "Automatic updates are not set up yet. Run the 0009 SQL file in Supabase to switch on triggers."
    : run
      ? `Last automatic scan ${timeAgo(new Date(run.finishedAt ?? run.startedAt).getTime())}: ${run.added} new lead${run.added === 1 ? "" : "s"}, ${run.updated} updated, ${run.triggers} trigger${run.triggers === 1 ? "" : "s"}.${run.failedSearches ? ` ${run.failedSearches} search${run.failedSearches === 1 ? "" : "es"} could not be reached.` : ""}`
      : "No automatic scan has finished yet. It runs once a day; you can also look now.";

  return (
    <>
      <TopBar left={<Breadcrumbs items={[{ label: "Western Canada" }, { label: "Today's brief" }]} />} right={<></>} />
      <div className="mx-auto w-full max-w-[920px] space-y-10 px-8 py-8">
        <section className="rounded-2xl bg-linear-to-br from-rail via-navy to-brand p-6 text-white shadow-md">
          <h1 className="text-[22px] font-bold">Today&apos;s brief</h1>
          <p className="mt-2 max-w-[600px] text-[13px] leading-relaxed text-white/80">
            The platform scans news and official registers by itself every day, picks out what changed on the projects, and has the AI read the best new leads. This is the result: you do not need to run anything.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="brand" onClick={() => void refresh.refresh().then(feed.reload)} disabled={refresh.running}>
              {refresh.running ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              {refresh.running ? `Looking… ${refresh.done}/${refresh.total}` : "Look for new triggers now"}
            </Button>
            <span className="text-[12px] text-white/75" aria-live="polite">
              {refresh.finished && !refresh.running ? `Done: ${refresh.added} new lead${refresh.added === 1 ? "" : "s"} found.${refresh.error ? " Some searches could not be reached." : ""}` : runNote}
            </span>
          </div>
        </section>

        <ReadyForReview />

        <section className="space-y-4">
          <SectionTitle icon={<Radio className="size-4 text-brand-dark" aria-hidden />} title="Triggers to follow" note="New coverage of a saved project, a register moving a project to a new stage, or a contractor being named. Leads you follow come first." />
          {!loaded || feed.loading ? (
            <p className="text-[12.5px] text-neutral-500">Loading…</p>
          ) : triggers.length === 0 ? (
            <p className="rounded-lg border border-line bg-neutral-50 p-4 text-[12.5px] text-neutral-600">
              {feed.available ? "No triggers yet. They appear after the next automatic scan finds a change on a saved project." : "Triggers are not switched on yet."}
            </p>
          ) : (
            <>
              <ul className="space-y-2.5">
                {triggers.slice(0, shown).map(({ e, lead, followed }) => (
                  <li key={e.id} className="rounded-lg border border-line bg-surface p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-brand-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-brand-dark">{KIND_LABEL[e.kind]}</span>
                      {followed && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-900">You follow this</span>}
                      {isNewSince(e.createdAt, previousVisit) && <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-900">New</span>}
                      <span className="ml-auto text-[11px] text-neutral-500">{day(e.occurredAt)}</span>
                    </div>
                    <p className="mt-2 text-[13px] font-medium">{e.title}</p>
                    {e.detail && <p className="mt-0.5 text-[12px] text-neutral-500">{e.detail}</p>}
                    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                      <Link href={href(lead)} className="font-medium text-brand-dark underline-offset-2 hover:underline">
                        Open lead: {lead.title.length > 70 ? `${lead.title.slice(0, 69)}…` : lead.title}
                      </Link>
                      {e.link && (
                        <a href={e.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-neutral-600 underline-offset-2 hover:underline">
                          Source <ExternalLink className="size-3" aria-hidden />
                        </a>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
              {triggers.length > shown && (
                <Button onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, triggers.length - shown)} more</Button>
              )}
            </>
          )}
        </section>

        <section className="space-y-4">
          <SectionTitle icon={<CalendarClock className="size-4 text-brand-dark" aria-hidden />} title="Tenders closing within a week" note="Federal tenders with a closing date in the next seven days." />
          {closing.length === 0 ? (
            <p className="rounded-lg border border-line bg-neutral-50 p-4 text-[12.5px] text-neutral-600">None closing in the next seven days.</p>
          ) : (
            <ul className="space-y-2">
              {closing.map((o) => (
                <li key={o.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3 text-[13px]">
                  <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-red-900">{o.daysLeft} day{o.daysLeft === 1 ? "" : "s"}</span>
                  <Link href={href(o)} className="min-w-0 flex-1 truncate font-medium underline-offset-2 hover:underline">
                    {o.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4">
          <SectionTitle
            icon={<Sparkles className="size-4 text-brand-dark" aria-hidden />}
            title="Best new leads"
            note={previousVisit ? `Added since your last visit (${day(previousVisit)}), highest score first. The AI summary is prepared in advance when there is one.` : "Added in the last seven days, highest score first. The AI summary is prepared in advance when there is one."}
          />
          {newLeads.length === 0 ? (
            <p className="rounded-lg border border-line bg-neutral-50 p-4 text-[12.5px] text-neutral-600">Nothing new since your last visit.</p>
          ) : (
            <ul className="space-y-2.5">
              {newLeads.map((o) => {
                const s = summaries[o.id];
                return (
                  <li key={o.id} className="rounded-lg border border-line bg-surface p-3.5">
                    <div className="flex items-start gap-3">
                      <span className="shrink-0 font-mono text-[15px] font-bold text-brand-dark">{scoreOf(o)}</span>
                      <div className="min-w-0">
                        <Link href={href(o)} className="text-[13px] font-medium underline-offset-2 hover:underline">
                          {o.title}
                        </Link>
                        <p className="mt-0.5 text-[11.5px] text-neutral-500">{[o.owner === "Not identified in headline" ? "Owner not named" : o.owner, o.location].join(" · ")}</p>
                        {s?.whyItMatters && <p className="mt-2 rounded border border-brand-line bg-brand-soft p-2.5 text-[12.5px] leading-relaxed">{s.whyItMatters}</p>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
