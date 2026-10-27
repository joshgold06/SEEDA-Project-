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

export function peopleSearches(opp: Opportunity): PeopleSearch[] {
  const searches: PeopleSearch[] = [];
  const ownerKnown = opp.owner && opp.owner !== "Not identified in headline";
  const project = opp.fullTitle ?? opp.title;

  if (ownerKnown) {
    searches.push({ label: `People at ${opp.owner}`, note: "Owner: project and procurement roles on LinkedIn", url: linkedInPeople(opp.owner) });
  }
  for (const c of contractorsOf(opp).slice(0, 3)) {
    searches.push({ label: `People at ${c}`, note: "Contractor: project and procurement roles on LinkedIn", url: linkedInPeople(c) });
  }
  searches.push({
    label: ownerKnown ? "Who else is on this project" : "Who owns and builds this",
    note: "Google: contractors, owners and partners named for it",
    url: google(`${ownerKnown ? `"${opp.owner}" ` : ""}${project} contractor OR EPC OR awarded OR partner`),
  });
  return searches;
}
