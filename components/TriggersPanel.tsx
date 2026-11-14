"use client";

import { ExternalLink, Radio } from "lucide-react";
import type { Opportunity } from "@/lib/data";
import { KIND_LABEL, useLeadTriggers } from "@/lib/triggers";

const when = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });

/** What has happened to this lead since it was found: new coverage, a stage change, a contractor named. Hidden until there is something. */
export function TriggersPanel({ opp }: { opp: Opportunity }) {
  const { events } = useLeadTriggers(opp.id);
  // The "new lead" entry only repeats the lead's own page, so it is shown only when it is the sole entry.
  const shown = events.filter((e) => e.kind !== "new_lead" || events.length === 1);
  if (shown.length === 0) return null;

  return (
    <section className="mt-6 rounded-lg border border-line bg-neutral-50 p-4">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold">
        <Radio className="size-4 shrink-0 text-brand-dark" aria-hidden />
        Triggers to follow ({shown.length})
      </h2>
      <p className="mt-1 text-[11.5px] leading-relaxed text-neutral-500">Things that happened on this project that are worth a closer look. Found by the automatic daily scan; each links to its source.</p>
      <ul className="mt-3 space-y-2.5">
        {shown.map((e) => (
          <li key={e.id} className="flex items-start gap-2.5 text-[12.5px]">
            <span className="mt-0.5 shrink-0 rounded bg-brand-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-brand-dark">{KIND_LABEL[e.kind]}</span>
            <span className="min-w-0">
              <span className="font-medium">{e.title}</span>
              {e.detail && <span className="block text-[11.5px] text-neutral-500">{e.detail}</span>}
              <span className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-500">
                {when(e.occurredAt)}
                {e.link && (
                  <a href={e.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-dark underline-offset-2 hover:underline">
                    Source <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
