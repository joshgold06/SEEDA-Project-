import type { FactorKey, Opportunity } from "./data";

export interface FactorInfo {
  key: FactorKey;
  label: string;
  /** Plain-language description shown next to the slider. */
  help: string;
  /** Tailwind background class, used for the stacked score bar. */
  bar: string;
}

export const FACTORS: FactorInfo[] = [
  { key: "region", label: "Location", help: "Project is in Alberta, BC or Saskatchewan", bar: "bg-sky-500" },
  { key: "signal", label: "Signal type", help: "Contract award, approval, turnaround and so on", bar: "bg-indigo-500" },
  { key: "keywords", label: "EPC keywords", help: "Matches EPCMst's keyword list", bar: "bg-violet-500" },
  { key: "recency", label: "Freshness", help: "How recent the news is", bar: "bg-teal-500" },
  { key: "value", label: "Project size", help: "Dollar value stated in the headline", bar: "bg-amber-500" },
  { key: "contractor", label: "Contractor named", help: "A builder is named, so there are people to contact", bar: "bg-rose-500" },
  { key: "owner", label: "Private owner", help: "Private owners award work by private RFP", bar: "bg-emerald-600" },
];

export type Weights = Record<FactorKey, number>;
export const DEFAULT_WEIGHTS: Weights = { region: 1, signal: 1, keywords: 1, recency: 1, value: 1, contractor: 1, owner: 1 };

export interface WeightPreset {
  id: string;
  label: string;
  weights: Weights;
}

export const WEIGHT_PRESETS: WeightPreset[] = [
  { id: "balanced", label: "Balanced", weights: DEFAULT_WEIGHTS },
  { id: "private", label: "Private owners first", weights: { ...DEFAULT_WEIGHTS, owner: 2, contractor: 1.5, value: 0.75 } },
  { id: "fresh", label: "Freshest news", weights: { ...DEFAULT_WEIGHTS, recency: 2, signal: 1.25, keywords: 0.75 } },
  { id: "big", label: "Biggest projects", weights: { ...DEFAULT_WEIGHTS, value: 2, region: 0.75, recency: 0.5 } },
];

export interface ScorePart {
  key: FactorKey;
  points: number;
}

/** The per-factor points behind a lead's score, or null for leads saved before this was recorded. */
export function scoreParts(o: Opportunity): ScorePart[] | null {
  const byKey = new Map<FactorKey, number>();
  for (const r of o.relevance ?? []) {
    if (r.factor && typeof r.points === "number") byKey.set(r.factor, (byKey.get(r.factor) ?? 0) + r.points);
  }
  if (!byKey.size) return null;
  return FACTORS.map((f) => ({ key: f.key, points: byKey.get(f.key) ?? 0 }));
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function adjustedParts(o: Opportunity, w: Weights): ScorePart[] | null {
  return scoreParts(o)?.map((p) => ({ key: p.key, points: p.points * w[p.key] })) ?? null;
}

/** Score under the user's weights; leads without a recorded breakdown keep their original score. */
export function adjustedScore(o: Opportunity, w: Weights): number {
  const parts = adjustedParts(o, w);
  return parts ? clamp(parts.reduce((s, p) => s + p.points, 0)) : o.score;
}

export const isDefault = (w: Weights) => FACTORS.every((f) => w[f.key] === 1);

export interface Comparison {
  scoreA: number;
  scoreB: number;
  rows: { key: FactorKey; label: string; a: number; b: number; diff: number }[];
  summary: string;
}

const short = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function compareLeads(a: Opportunity, b: Opportunity, w: Weights): Comparison | null {
  const pa = adjustedParts(a, w);
  const pb = adjustedParts(b, w);
  if (!pa || !pb) return null;
  const rows = FACTORS.map((f, i) => ({
    key: f.key,
    label: f.label,
    a: Math.round(pa[i].points * 10) / 10,
    b: Math.round(pb[i].points * 10) / 10,
    diff: Math.round((pa[i].points - pb[i].points) * 10) / 10,
  }));
  const scoreA = adjustedScore(a, w);
  const scoreB = adjustedScore(b, w);
  const gap = scoreA - scoreB;
  // Phrase each gap from the higher-scoring lead's side so "+9" always means an advantage.
  const sign = gap < 0 ? -1 : 1;
  const drivers = rows
    .filter((r) => (gap === 0 ? r.diff !== 0 : r.diff * sign > 0))
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))
    .slice(0, 2);
  const phrase = (r: (typeof rows)[number]) => `${r.label.toLowerCase()} (${r.diff * sign > 0 ? "+" : ""}${Math.round(r.diff * sign * 10) / 10})`;
  let summary: string;
  if (gap === 0 && !drivers.length) summary = "These two leads score the same on every factor.";
  else if (gap === 0) summary = `They tie at ${scoreA}, but differ on ${drivers.map(phrase).join(" and ")}.`;
  else {
    const [hi, lo, hiScore, loScore] = gap > 0 ? [a, b, scoreA, scoreB] : [b, a, scoreB, scoreA];
    summary = `"${short(hi.title)}" scores ${hiScore} against ${loScore} for "${short(lo.title)}". ${drivers.length ? `It leads mainly on ${drivers.map(phrase).join(" and ")}.` : ""}`;
  }
  return { scoreA, scoreB, rows, summary };
}
