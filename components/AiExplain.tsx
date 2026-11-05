"use client";

import { useState } from "react";
import { Info, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/AuthContext";
import type { Explained } from "@/lib/ai/explain";
import { requestExplain } from "@/lib/ai/explainClient";
import type { Opportunity } from "@/lib/data";

const NOT_STATED = "Not stated in the record";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded border border-line bg-surface p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className={`mt-1.5 text-[13px] ${value ? "font-semibold" : "text-neutral-400"}`}>{value ?? NOT_STATED}</div>
    </div>
  );
}

/** Asks the AI to read this lead's own record text and fill in type, scale, stage and why it matters. Nothing is saved. */
export function AiExplain({ opp }: { opp: Opportunity }) {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Explained | null>(null);
  const [forId, setForId] = useState<string | null>(null);

  // A summary belongs to one lead; moving to another lead must not show it.
  const shown = forId === opp.id ? summary : null;

  async function run() {
    if (!session) return;
    setBusy(true);
    setError(null);
    const outcome = await requestExplain(session.access_token, opp.id);
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    setSummary(outcome.summary);
    setForId(opp.id);
  }

  return (
    <section className="rounded-lg border border-line bg-neutral-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-[520px]">
          <h2 className="text-[13px] font-semibold">AI summary of this record</h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-neutral-500">
            Reads only the text of this record and pulls out the project type, scale, stage and why it might matter. The scale and stage must quote the record, or they are left out.
          </p>
        </div>
        <Button variant="primary" onClick={run} disabled={busy || !session}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {busy ? "Reading…" : shown ? "Run again" : "Explain with AI"}
        </Button>
      </div>

      {error && <p role="alert" className="mt-3 text-[12px] text-red-600">{error}</p>}

      {shown && !busy && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project type" value={shown.projectType} />
            <Field label="Scale" value={shown.scale} />
            <Field label="Stage" value={shown.stage} />
            <Field label="Deadline" value={shown.deadline} />
          </div>
          {shown.whyItMatters && (
            <div className="rounded border border-brand-line bg-brand-soft p-3">
              <div className="font-mono text-[10px] uppercase tracking-wider text-brand-dark">Why it might matter</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{shown.whyItMatters}</p>
            </div>
          )}
          {shown.confirmNext.length > 0 && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">Confirm next</div>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12.5px] text-neutral-700">
                {shown.confirmNext.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
          {shown.dropped.length > 0 && (
            <p className="flex items-start gap-1.5 text-[11.5px] text-warn">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              Left out because the record doesn&apos;t back it up: {shown.dropped.join("; ")}.
            </p>
          )}
          <p className="text-[11px] text-neutral-500">Written by an AI from the record text only. Check the source document before you rely on it.</p>
        </div>
      )}
    </section>
  );
}
