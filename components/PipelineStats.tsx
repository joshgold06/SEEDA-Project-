"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Opportunity, STAGES } from "@/lib/data";
import { Tag } from "./ui";

const STALE_CHOICES = [3, 7, 14];
const DAY = 86_400_000;

const daysSince = (iso: string | undefined) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null);

export function staleLeads(leads: Opportunity[], days: number) {
  return leads
    .map((o) => ({ o, idle: daysSince(o.actedAt) }))
    .filter((x): x is { o: Opportunity; idle: number } => x.idle !== null && x.idle >= days)
    .sort((a, b) => b.idle - a.idle);
}

/** How far leads get through the stages, and which ones have gone quiet. */
export function PipelineStats({ leads, staleDays, onStaleDays }: { leads: Opportunity[]; staleDays: number; onStaleDays: (days: number) => void }) {
  const [showAll, setShowAll] = useState(false);

  const funnel = useMemo(() => {
    // "Reached" counts a lead in its own stage and every later one, so each bar is the
    // number of leads that got at least this far.
    const rows = STAGES.map((s, i) => ({ ...s, now: leads.filter((o) => o.stage === s.id).length, reached: leads.filter((o) => o.stage && STAGES.findIndex((x) => x.id === o.stage) >= i).length }));
    return rows.map((r, i) => ({ ...r, step: i === 0 || rows[i - 1].reached === 0 ? null : Math.round((r.reached / rows[i - 1].reached) * 100) }));
  }, [leads]);
  const top = Math.max(1, funnel[0]?.reached ?? 1);

  const stale = useMemo(() => staleLeads(leads, staleDays), [leads, staleDays]);
  const shown = showAll ? stale : stale.slice(0, 5);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h3 className="text-[12.5px] font-semibold">Funnel</h3>
        <p className="mt-0.5 text-[11.5px] text-neutral-500">Each bar is how many leads got at least this far.</p>
        <ul className="mt-3 space-y-2.5">
          {funnel.map((r) => (
            <li key={r.id}>
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="font-medium">{r.label}</span>
                <span className="text-neutral-500"><strong className="font-mono text-ink">{r.reached}</strong>{r.step !== null && <span className="ml-2 text-[11px]">{r.step}% of the step before</span>}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-100" role="img" aria-label={`${r.label}: ${r.reached} leads reached this stage, ${r.now} are here now`}>
                <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${(r.reached / top) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[12.5px] font-semibold">Stale leads <span className="font-normal text-neutral-500">({stale.length})</span></h3>
          <div className="flex items-center gap-1 text-[11px] text-neutral-500" role="group" aria-label="How long counts as stale">
            Quiet for
            {STALE_CHOICES.map((d) => (
              <button key={d} onClick={() => onStaleDays(d)} aria-pressed={staleDays === d} className={`rounded-full px-2 py-0.5 font-medium ${staleDays === d ? "bg-action text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>{d}+ days</button>
            ))}
          </div>
        </div>
        {stale.length === 0 ? (
          <p className="mt-3 text-[12px] text-neutral-500">Nothing has sat untouched for {staleDays} days or more.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
            {shown.map(({ o, idle }) => (
              <li key={o.id}>
                <Link href={o.stage === "outreach" ? `/shortlist/${o.id}` : o.inScan ? `/scan/${o.id}` : `/shortlist/${o.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-neutral-50">
                  <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{o.title}</span>
                  <Tag>{STAGES.find((s) => s.id === o.stage)?.label}</Tag>
                  <span className="w-14 shrink-0 text-right font-mono text-[10.5px] text-warn">{idle}d idle</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {stale.length > 5 && <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-[11.5px] font-medium text-brand hover:underline">{showAll ? "Show fewer" : `Show all ${stale.length}`}</button>}
      </div>
    </div>
  );
}
