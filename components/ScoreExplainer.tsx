"use client";

import { useMemo, useState } from "react";
import { GitCompare } from "lucide-react";
import type { Opportunity } from "@/lib/data";
import { adjustedParts, compareLeads, FACTORS, isDefault, scoreParts } from "@/lib/scoring";
import { useStore } from "@/lib/store";
import { useWeights } from "@/lib/weights";

const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

export function ScoreExplainer({ opp }: { opp: Opportunity }) {
  const { opportunities } = useStore();
  const { weights, scoreOf } = useWeights();
  const [otherId, setOtherId] = useState("");

  const parts = adjustedParts(opp, weights);
  const customised = !isDefault(weights);
  const candidates = useMemo(
    () => opportunities.filter((o) => o.id !== opp.id && o.inScan && !o.dismissed && scoreParts(o)).sort((a, b) => scoreOf(b) - scoreOf(a)),
    [opportunities, opp.id, scoreOf]
  );
  const other = candidates.find((o) => o.id === otherId);
  const comparison = other ? compareLeads(opp, other, weights) : null;

  if (!parts) {
    return (
      <section className="rounded-md border border-line bg-white p-5">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-600">Score breakdown</h2>
        <p className="mt-3 text-[12.5px] leading-relaxed text-neutral-500">This lead was saved before score breakdowns were recorded. Run a search from the Morning Scan home page to refresh it.</p>
      </section>
    );
  }

  const total = scoreOf(opp);
  const positive = parts.filter((p) => p.points > 0);
  const positiveSum = positive.reduce((s, p) => s + p.points, 0) || 1;

  return (
    <section className="rounded-md border border-line bg-white p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-600">Score breakdown</h2>
        <span className="font-mono text-[20px] font-bold text-brand-dark">{total}<span className="text-[12px] font-medium text-neutral-400"> / 100</span></span>
      </div>
      {customised && <p className="mt-1 text-[11.5px] text-brand-dark">Using your custom weights from the Morning Scan home page.</p>}

      <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-neutral-100" role="img" aria-label="Share of the score from each factor">
        {positive.map((p) => {
          const info = FACTORS.find((f) => f.key === p.key)!;
          return <div key={p.key} className={`${info.bar} transition-all duration-500`} style={{ width: `${(p.points / positiveSum) * 100}%` }} title={`${info.label}: ${Math.round(p.points * 10) / 10}`} />;
        })}
      </div>

      <ul className="mt-4 space-y-2.5">
        {FACTORS.map((f, i) => {
          const pts = Math.round(parts[i].points * 10) / 10;
          const w = weights[f.key];
          return (
            <li key={f.key} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-[12px]">
              <span className="flex items-center gap-2 text-neutral-700"><span className={`size-2 rounded-full ${f.bar}`} />{f.label}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div className={`h-full ${pts < 0 ? "bg-red-400" : f.bar} transition-all duration-500`} style={{ width: `${Math.min(100, (Math.abs(pts) / 25) * 100)}%` }} />
              </div>
              <span className="w-24 text-right font-mono text-[11.5px] text-neutral-600">
                {signed(pts)}
                {w !== 1 && <span className="ml-1 text-brand-dark">×{w}</span>}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 border-t border-line pt-4">
        <label className="flex items-center gap-2 text-[12px] font-medium text-neutral-700">
          <GitCompare className="size-3.5 text-brand" />
          Why does this score differently from…
        </label>
        <select value={otherId} onChange={(e) => setOtherId(e.target.value)} className="mt-2 h-8 w-full rounded border border-line bg-white px-2 text-[12px]">
          <option value="">Pick another lead to compare</option>
          {candidates.map((o) => (
            <option key={o.id} value={o.id}>{`${scoreOf(o)} · ${o.title.length > 62 ? `${o.title.slice(0, 61)}…` : o.title}`}</option>
          ))}
        </select>

        {comparison && other && (
          <div className="rise-in mt-4">
            <p className="text-[12.5px] leading-relaxed text-neutral-700">{comparison.summary}</p>
            <table className="mt-3 w-full text-[11.5px]">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="pb-1.5 font-medium">Factor</th>
                  <th className="pb-1.5 text-right font-medium">This lead</th>
                  <th className="pb-1.5 text-right font-medium">Other</th>
                  <th className="pb-1.5 text-right font-medium">Gap</th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((r) => (
                  <tr key={r.key} className="border-t border-line">
                    <td className="py-1.5 text-neutral-700">{r.label}</td>
                    <td className="py-1.5 text-right font-mono">{r.a}</td>
                    <td className="py-1.5 text-right font-mono">{r.b}</td>
                    <td className={`py-1.5 text-right font-mono font-semibold ${r.diff > 0 ? "text-brand-dark" : r.diff < 0 ? "text-red-600" : "text-neutral-400"}`}>{r.diff === 0 ? "0" : signed(r.diff)}</td>
                  </tr>
                ))}
                <tr className="border-t border-ink/20 font-semibold">
                  <td className="py-1.5">Total</td>
                  <td className="py-1.5 text-right font-mono">{comparison.scoreA}</td>
                  <td className="py-1.5 text-right font-mono">{comparison.scoreB}</td>
                  <td className="py-1.5 text-right font-mono">{signed(comparison.scoreA - comparison.scoreB)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
