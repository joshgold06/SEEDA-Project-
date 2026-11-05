"use client";

import Link from "next/link";
import { useMemo } from "react";
import { TriangleAlert, Copy } from "lucide-react";
import { STAGES, type Opportunity } from "@/lib/data";
import { relatedIndex } from "@/lib/related";
import { useStore } from "@/lib/store";

const stageLabel = (o: Opportunity) => STAGES.find((s) => s.id === o.stage)?.label ?? "Not shortlisted";
// Contact is already under way for these; the others are still being looked at.
const underway = (o: Opportunity) => o.stage === "outreach" || o.stage === "pipeline";

/**
 * Other leads that look like the same project. On the detail page it is a plain list; in the Outreach Studio it turns
 * into a warning when one of them is already at Outreach or Pipeline, so the same company isn't contacted twice.
 */
export function RelatedLeads({ opp, mode }: { opp: Opportunity; mode: "detail" | "outreach" }) {
  const { opportunities } = useStore();
  const lookup = useMemo(() => relatedIndex(opportunities), [opportunities]);
  const related = useMemo(() => lookup(opp), [lookup, opp]);
  if (related.length === 0) return null;

  const warn = mode === "outreach" && related.some((r) => underway(r.lead));
  const Icon = warn ? TriangleAlert : Copy;

  return (
    <section
      role={warn ? "alert" : undefined}
      className={`mt-6 rounded-lg border p-4 ${warn ? "border-amber-300 bg-amber-50 text-amber-950" : "border-line bg-neutral-50"}`}
    >
      <h2 className={`flex items-center gap-2 text-[13px] font-semibold ${warn ? "text-amber-900" : ""}`}>
        <Icon className="size-4 shrink-0" aria-hidden />
        {warn
          ? "You may already be contacting this project's company"
          : `${related.length} other lead${related.length === 1 ? "" : "s"} may be about this same project`}
      </h2>
      <p className={`mt-1 text-[11.5px] leading-relaxed ${warn ? "text-amber-900/80" : "text-neutral-500"}`}>
        {warn
          ? "Another lead that looks like the same project is already at Outreach or Pipeline. Check it before you write to the same company again."
          : "Matched by wording and dollar figures, so it can be wrong. Check before you move more than one of them forward."}
      </p>
      <ul className="mt-3 space-y-1.5">
        {related.map(({ lead, reason }) => (
          <li key={lead.id} className="flex items-start gap-2.5 text-[12.5px]">
            <span
              className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${underway(lead) ? "bg-amber-300 text-amber-950" : warn ? "bg-amber-100 text-amber-900" : "bg-neutral-200 text-neutral-700"}`}
            >
              {stageLabel(lead)}
            </span>
            <span className="min-w-0">
              <Link href={underway(lead) ? `/shortlist/${lead.id}` : `/scan/${lead.id}`} className={`font-medium underline-offset-2 hover:underline ${warn ? "text-amber-950" : ""}`}>
                {lead.fullTitle ?? lead.title}
              </Link>
              <span className={`block text-[11px] ${warn ? "text-amber-900/70" : "text-neutral-500"}`}>{reason}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
