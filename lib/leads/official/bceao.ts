import { getJson } from "./text";
import type { OfficialRecord } from "./types";

// BC Environmental Assessment Office: the public project register behind its website, with the proponent named.
// Only projects under the current (2018) Act are read: the older records were last edited in 2019.
const SEARCH = "https://projects.eao.gov.bc.ca/api/public/search";
const PAGE_SIZE = 200;

// Phases where a project is being assessed or is approved and heading to construction.
// Withdrawn, terminated, complete and operating projects are left out.
const ACTIVE_PHASES = new Set([
  "Early Engagement",
  "Process Planning",
  "Application Development and Review",
  "Application Review",
  "Effects Assessment",
  "Readiness Decision",
  "Referral",
  "Pre-Application",
  "Post Decision - Pre-Construction",
  "Post Decision - Construction",
  "Post Decision - Amendment",
  "Post Decision - Extension",
]);

interface EaoProject {
  _id?: string;
  name?: string;
  type?: string;
  sector?: string;
  description?: string;
  location?: string;
  legislation?: string;
  proponent?: { name?: string; company?: string };
  currentPhaseName?: { name?: string };
  eaStatus?: string;
  intake?: { investment?: number | string | null };
}

export function parseEao(results: EaoProject[]): OfficialRecord[] {
  const records: OfficialRecord[] = [];
  for (const p of results) {
    const phase = p.currentPhaseName?.name ?? "";
    const name = p.name?.replace(/\s+/g, " ").trim();
    if (!p._id || !name || !/2018/.test(p.legislation ?? "") || !ACTIVE_PHASES.has(phase)) continue;
    const description = (p.description ?? "").replace(/\s+/g, " ").trim();
    const investment = Number(p.intake?.investment);
    const value = Number.isFinite(investment) && investment >= 1e6 ? investment : undefined;
    const proponent = (p.proponent?.name ?? p.proponent?.company ?? "").replace(/\s+/g, " ").trim() || null;
    records.push({
      origin: "Regulatory",
      source: "bc-eao",
      recordId: p._id,
      publisher: "BC Environmental Assessment Office",
      title: `${name}: BC environmental assessment, ${phase}`,
      link: `https://projects.eao.gov.bc.ca/p/${p._id}/project-details`,
      // The register shows no change date, so a lead is dated by the day it is found.
      date: null,
      region: "British Columbia",
      placeText: `${p.location ?? ""} ${name} ${description.slice(0, 400)}`,
      organization: proponent,
      contractors: [],
      category: [p.type, p.sector].filter(Boolean).join(" / "),
      description,
      value,
      sizeNote: value ? "Capital cost reported by the proponent" : undefined,
      stage: phase,
      stageNote: p.eaStatus ? `Assessment decision: ${p.eaStatus}` : "via the BC EAO project register",
      documentName: "BC EAO project page",
      overview: `Listed on the BC Environmental Assessment Office project register, currently in "${phase}". Proponent: ${proponent ?? "not given"}.${p.location ? ` Location: ${p.location.trim()}.` : ""} ${description ? `The register describes it as: ${description.slice(0, 700)}${description.length > 700 ? "…" : ""}` : "The register gives no description."}`,
    });
  }
  return records;
}

export async function fetchBcEao(): Promise<OfficialRecord[]> {
  const page = (n: number) => getJson(`${SEARCH}?dataset=Project&pageNum=${n}&pageSize=${PAGE_SIZE}&projectLegislation=default&sortBy=-datePosted`, "The BC project register") as Promise<{ searchResults?: EaoProject[]; meta?: { searchResultsTotal?: number }[] }[]>;
  const first = await page(0);
  const results = [...(first[0]?.searchResults ?? [])];
  const total = first[0]?.meta?.[0]?.searchResultsTotal ?? results.length;
  const more = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(total / PAGE_SIZE) - 1) }, (_, i) => page(i + 1)));
  for (const m of more) results.push(...(m[0]?.searchResults ?? []));
  return parseEao(results);
}
