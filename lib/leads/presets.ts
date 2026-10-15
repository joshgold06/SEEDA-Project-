// Seed searches. Each is a Google News query limited to recent news and to
// Alberta, built from the company's guidance: major projects, who is building
// them, and the trigger keywords in "Google Tools to Identify New Clients"
// (turnaround, pipeline integrity, facility overhaul, carbon capture).
// Terms are grouped in parentheses so region, signal and facility type must all
// appear (AND between groups).

export interface SearchPreset {
  id: string;
  label: string;
  query: string;
}

export const SEARCH_PRESETS: SearchPreset[] = [
  {
    id: "major-projects",
    label: "Major projects",
    query: '("major project" OR megaproject OR "billion" OR "capital project") (construction OR expansion OR build OR "final investment decision") (Alberta OR Calgary OR Edmonton OR "Fort McMurray") when:30d',
  },
  {
    id: "contractor-awards",
    label: "Contractor awards",
    // Award announcements are rare, so this one looks back 90 days instead of 30.
    query: '(contractor OR EPC OR "engineering firm" OR "construction firm") (awarded OR selected OR chosen OR wins OR secures) (Alberta OR Calgary OR Edmonton OR "Fort McMurray") when:90d',
  },
  {
    id: "facilities",
    label: "Gas plants & oil sands",
    query: '(Alberta OR "Fort McMurray" OR "Fort Saskatchewan" OR "Grande Prairie") ("gas plant" OR "gas processing" OR refinery OR upgrader OR "oil sands" OR petrochemical) (expansion OR construction OR approval OR "final investment decision") when:30d',
  },
  {
    id: "turnarounds",
    label: "Turnarounds & integrity",
    query: '(Alberta OR "Fort McMurray" OR Edmonton OR Calgary OR "oil sands") (turnaround OR shutdown OR "pipeline integrity" OR "facility overhaul") when:30d',
  },
  {
    id: "energy-transition",
    label: "Carbon capture & hydrogen",
    query: '("carbon capture" OR CCUS OR hydrogen OR lithium) (Alberta) (project OR approval OR application OR construction) when:30d',
  },
  {
    id: "pipelines",
    label: "Pipeline projects",
    query: 'pipeline (expansion OR approval OR construction OR integrity) Alberta when:30d',
  },
];

export function resolveQuery(presetId?: string, custom?: string): string | null {
  if (presetId) return SEARCH_PRESETS.find((p) => p.id === presetId)?.query ?? null;
  const text = custom?.trim();
  if (!text) return null;
  return /when:\d+[dhm]/.test(text) ? text : `${text} when:30d`;
}
