// Seed searches. Each is a Google News query limited to recent news and to
// Alberta, British Columbia and Saskatchewan, built from the company's guidance:
// major projects, who is building them, and the trigger keywords in "Google
// Tools to Identify New Clients" (turnaround, pipeline integrity, facility
// overhaul, carbon capture). Terms are grouped in parentheses so region, signal
// and facility type must all appear (AND between groups).

export interface SearchPreset {
  id: string;
  label: string;
  query: string;
}

const WEST = '(Alberta OR "British Columbia" OR "B.C." OR Saskatchewan)';
const FACILITY_TERMS =
  '("gas plant" OR "gas processing" OR refinery OR upgrader OR "oil sands" OR petrochemical OR potash OR mine) (expansion OR construction OR approval OR "final investment decision")';

export const SEARCH_PRESETS: SearchPreset[] = [
  {
    id: "major-projects",
    label: "Major projects",
    query: `("major project" OR megaproject OR "billion" OR "capital project") (construction OR expansion OR build OR "final investment decision") ${WEST} when:30d`,
  },
  {
    id: "contractor-awards",
    label: "Contractor awards",
    // Award announcements are rare, so this one looks back 90 days instead of 30.
    query: `(contractor OR EPC OR "engineering firm" OR "construction firm") (awarded OR selected OR chosen OR wins OR secures) (Alberta OR "B.C." OR Saskatchewan OR Kitimat OR "Fort McMurray") when:90d`,
  },
  // One search per province: a single combined query returned far fewer leads,
  // because the region terms change which headlines Google ranks.
  {
    id: "facilities-ab",
    label: "Alberta plants & oil sands",
    query: `(Alberta OR "Fort McMurray" OR "Fort Saskatchewan" OR "Grande Prairie") ${FACILITY_TERMS} when:30d`,
  },
  {
    id: "facilities-sk",
    label: "Saskatchewan potash & mines",
    query: `(Saskatchewan OR Regina OR Saskatoon OR Estevan OR Lloydminster) ${FACILITY_TERMS} when:30d`,
  },
  {
    id: "facilities-bc",
    label: "BC refineries & plants",
    query: `("British Columbia" OR "B.C." OR "Fort St. John" OR "Prince George" OR "Dawson Creek" OR Montney) ${FACILITY_TERMS} when:30d`,
  },
  {
    id: "lng-bc",
    label: "BC LNG expansion",
    query: 'LNG (Kitimat OR "British Columbia" OR "B.C.") (expansion OR approval OR construction OR terminal) when:30d',
  },
  {
    id: "turnarounds",
    label: "Turnarounds & integrity",
    query: `(Alberta OR "Fort McMurray" OR Edmonton OR Calgary OR "oil sands" OR Saskatchewan OR "B.C.") (turnaround OR shutdown OR "pipeline integrity" OR "facility overhaul") when:30d`,
  },
  {
    id: "energy-transition",
    label: "Carbon capture & hydrogen",
    query: `("carbon capture" OR CCUS OR hydrogen OR lithium) ${WEST} (project OR approval OR application OR construction) when:30d`,
  },
  {
    id: "pipelines",
    label: "Pipeline projects",
    query: `pipeline (expansion OR approval OR construction OR integrity) ${WEST} when:30d`,
  },
];

export function resolveQuery(presetId?: string, custom?: string): string | null {
  if (presetId) return SEARCH_PRESETS.find((p) => p.id === presetId)?.query ?? null;
  const text = custom?.trim();
  if (!text) return null;
  return /when:\d+[dhm]/.test(text) ? text : `${text} when:30d`;
}
