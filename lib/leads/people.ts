import type { Opportunity } from "../data";

// Max's approach for the people step is manual: find the project, find the
// companies on it, then find the people at those companies on LinkedIn. These
// helpers build those searches. They only open a search; nothing is scraped.

// Contractors live in the existing involved.secondary text so no new database
// column is needed; the prefix lets us read them back.
export const CONTRACTOR_PREFIX = "Contractors: ";

const ROLES = '"project manager" OR "project director" OR procurement OR "engineering manager" OR "construction manager"';

export const linkedInPeople = (org: string) =>
  `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`"${org}" (${ROLES})`)}`;
const google = (query: string) => `https://www.google.com/search?q=${encodeURIComponent(query)}`;

export interface PeopleSearch {
  label: string;
  note: string;
  url: string;
}

export function contractorsOf(opp: Opportunity): string[] {
  const text = opp.involved?.secondary ?? "";
  return text.startsWith(CONTRACTOR_PREFIX) ? text.slice(CONTRACTOR_PREFIX.length).split(", ").filter(Boolean) : [];
}

/** `confirmed` adds an owner and contractors the person accepted from research, beyond what the headline named. */
export function peopleSearches(opp: Opportunity, confirmed?: { owner?: string | null; contractors?: string[] }): PeopleSearch[] {
  const searches: PeopleSearch[] = [];
  const ownerName = opp.owner && opp.owner !== "Not identified in headline" && opp.owner !== "Unknown owner" ? opp.owner : (confirmed?.owner ?? null);
  const ownerKnown = Boolean(ownerName);
  const project = opp.fullTitle ?? opp.title;
  const contractors = [...new Set([...contractorsOf(opp), ...(confirmed?.contractors ?? [])])];

  if (ownerName) {
    searches.push({ label: `People at ${ownerName}`, note: "Owner: project and procurement roles on LinkedIn", url: linkedInPeople(ownerName) });
  }
  for (const c of contractors.slice(0, 3)) {
    searches.push({ label: `People at ${c}`, note: "Contractor: project and procurement roles on LinkedIn", url: linkedInPeople(c) });
  }
  searches.push({
    label: ownerKnown ? "Who else is on this project" : "Who owns and builds this",
    note: "Google: contractors, owners and partners named for it",
    url: google(`${ownerKnown ? `"${ownerName}" ` : ""}${project} contractor OR EPC OR awarded OR partner`),
  });
  return searches;
}
