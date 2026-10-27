import type { Opportunity } from "../data";
import { contractorsOf } from "../leads/people";
import { OWNER_NOT_NAMED } from "../supabase/mappers";
import type { ResearchRow } from "./types";

// The chain shows what the headline gave us plus whatever the person accepted from research.

export interface ChainCompany {
  name: string;
  /** True when it came from research the person accepted, not from the headline. */
  confirmed: boolean;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The same company under a longer or shorter name ("Surerus Murphy" and "Surerus Murphy Joint Venture"). */
export const sameCompany = (a: string, b: string) => {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x)));
};

export function chainCompanies(opp: Opportunity, research: ResearchRow | undefined): { owner: ChainCompany | null; contractors: ChainCompany[] } {
  const headlineOwner = opp.owner && opp.owner !== OWNER_NOT_NAMED && opp.owner !== "Unknown owner" ? opp.owner : null;
  const accepted = research?.accepted;
  const owner: ChainCompany | null = headlineOwner ? { name: headlineOwner, confirmed: false } : accepted?.owner ? { name: accepted.owner.name, confirmed: true } : null;

  const contractors: ChainCompany[] = contractorsOf(opp).map((name) => ({ name, confirmed: false }));
  for (const c of accepted?.contractors ?? []) {
    if (!contractors.some((x) => sameCompany(x.name, c.name)) && !(owner && sameCompany(owner.name, c.name))) contractors.push({ name: c.name, confirmed: true });
  }
  return { owner, contractors };
}

type Relevance = NonNullable<Opportunity["relevance"]>;

/** Swaps the "still need confirming" notes for what the person confirmed, once they have confirmed something. */
export function relevanceWithResearch(relevance: Relevance, research: ResearchRow | undefined): Relevance {
  const accepted = research?.accepted;
  if (!accepted || (!accepted.owner && accepted.contractors.length === 0)) return relevance;
  const parts = [accepted.owner ? `owner ${accepted.owner.name}` : null, accepted.contractors.length ? `contractor${accepted.contractors.length === 1 ? "" : "s"} ${accepted.contractors.map((c) => c.name).join(", ")}` : null].filter(Boolean);
  const confirmed: Relevance[number] = { text: `Confirmed by your research: ${parts.join("; ")}`, kind: "match" };
  const kept = relevance.filter((r) => !r.text.startsWith("News signal only") && !(accepted.owner && r.text.startsWith("Owner is not named")));
  return [...kept, confirmed];
}

export const hasAcceptedResearch = (research: ResearchRow | undefined) => Boolean(research && (research.accepted.owner || research.accepted.contractors.length));
