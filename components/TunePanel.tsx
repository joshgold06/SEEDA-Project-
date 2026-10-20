"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, Minus, RotateCcw, SlidersHorizontal } from "lucide-react";
import { adjustedScore, DEFAULT_WEIGHTS, FACTORS, isDefault, scoreParts, WEIGHT_PRESETS } from "@/lib/scoring";
import { useStore } from "@/lib/store";
import { useWeights } from "@/lib/weights";

const sameWeights = (a: Record<string, number>, b: Record<string, number>) => FACTORS.every((f) => a[f.key] === b[f.key]);

export function TunePanel() {
  const { opportunities } = useStore();
  const { weights, setWeights, setWeight, reset, scoreOf } = useWeights();

  const scorable = opportunities.filter((o) => o.inScan && !o.dismissed && scoreParts(o));
  const baseRank = new Map([...scorable].sort((a, b) => adjustedScore(b, DEFAULT_WEIGHTS) - adjustedScore(a, DEFAULT_WEIGHTS)).map((o, i) => [o.id, i]));
  const ranked = [...scorable].sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, 5);

  return (
    <section className="mt-6 rounded-lg border border-line bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="label flex items-center gap-2 !text-neutral-600"><SlidersHorizontal className="size-3.5 text-brand" />Tune the ranking</h2>
        {!isDefault(weights) && (
          <button onClick={reset} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-dark hover:underline"><RotateCcw className="size-3" />Reset</button>
        )}
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-neutral-500">
        Decide what matters most to you. Drag a slider and the lead list re-ranks instantly. Your choices are remembered on this device.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {WEIGHT_PRESETS.map((p) => {
          const active = sameWeights(weights, p.weights);
          return (
            <button key={p.id} onClick={() => setWeights(p.weights)} className={`h-[26px] rounded-full border px-3 text-[11.5px] font-medium transition-colors ${active ? "border-brand bg-brand text-white" : "border-line bg-white text-ink hover:bg-neutral-50"}`}>
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {FACTORS.map((f) => (
          <label key={f.key} className="block" title={f.help}>
            <span className="flex items-center justify-between text-[12px] text-neutral-700">
              <span className="flex items-center gap-2"><span className={`size-2 rounded-full ${f.bar}`} />{f.label}</span>
              <span className="font-mono text-[11.5px] text-neutral-500">×{weights[f.key]}</span>
            </span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.25}
              value={weights[f.key]}
              onChange={(e) => setWeight(f.key, Number(e.target.value))}
              aria-label={`${f.label} weight`}
              className="mt-1.5 h-1.5 w-full cursor-pointer accent-brand"
            />
          </label>
        ))}
      </div>

      <div className="mt-6 border-t border-line pt-4">
        <h3 className="text-[11.5px] font-semibold uppercase tracking-wider text-neutral-500">Top leads under your weights</h3>
        {ranked.length === 0 ? (
          <p className="mt-2 text-[12px] text-neutral-500">Ranking appears once leads with score breakdowns are loaded.</p>
        ) : (
          <ol className="mt-2 space-y-1.5">
            {ranked.map((o, i) => {
              const moved = (baseRank.get(o.id) ?? i) - i;
              return (
                <li key={o.id} className="rise-in">
                  <Link href={`/scan/${o.id}`} className="flex items-center gap-3 rounded px-2 py-1.5 text-[12.5px] hover:bg-neutral-50">
                    <span className="w-4 font-mono text-[11px] text-neutral-400">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{o.title}</span>
                    <span className="font-mono text-[12px] font-semibold text-brand-dark">{scoreOf(o)}</span>
                    <span className={`flex w-9 items-center justify-end gap-0.5 font-mono text-[10.5px] ${moved > 0 ? "text-brand-dark" : moved < 0 ? "text-red-600" : "text-neutral-300"}`}>
                      {moved > 0 ? <ArrowUp className="size-3" /> : moved < 0 ? <ArrowDown className="size-3" /> : <Minus className="size-3" />}
                      {moved !== 0 && Math.abs(moved)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
