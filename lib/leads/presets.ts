// Seed searches, one per signal the company described. Each is a Google News
// query limited to the last 30 days. Terms are grouped in parentheses so the
// region, the signal and the facility type must all appear (AND between groups).

export interface SearchPreset {
  id: string;
  label: string;
  query: string;
}

export const SEARCH_PRESETS: SearchPreset[] = [
  {
    id: "turnarounds",
    label: "Alberta turnarounds",
    query: '(Alberta OR "Fort McMurray" OR Edmonton OR Calgary OR "oil sands") (turnaround OR shutdown OR "pipeline integrity" OR "facility overhaul") when:30d',
  },
  {
    id: "energy-transition",
    label: "Carbon capture & hydrogen",
    query: '("carbon capture" OR CCUS OR hydrogen OR lithium) (Alberta OR "British Columbia" OR Saskatchewan) (project OR approval OR application OR construction) when:30d',
  },
  {
    id: "lng-bc",
    label: "BC LNG expansion",
    query: 'LNG (Kitimat OR "British Columbia" OR "B.C.") (expansion OR approval OR construction OR terminal) when:30d',
  },
  {
    id: "pipelines",
    label: "Pipeline projects",
    query: 'pipeline (expansion OR approval OR construction OR integrity) (Alberta OR "British Columbia" OR Saskatchewan) when:30d',
  },
  {
    id: "water",
    label: "Water & wastewater",
    query: '(Alberta OR Calgary OR Edmonton OR "Red Deer" OR Lethbridge) ("water treatment" OR wastewater OR "water reuse") (plant OR upgrade OR expansion OR funding OR construction) when:30d',
  },
];

export function resolveQuery(presetId?: string, custom?: string): string | null {
  if (presetId) return SEARCH_PRESETS.find((p) => p.id === presetId)?.query ?? null;
  const text = custom?.trim();
  if (!text) return null;
  return /when:\d+[dhm]/.test(text) ? text : `${text} when:30d`;
}
