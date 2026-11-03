import type { FactorKey } from "../../data";
import { detectOrganization, found, formatMoney, hash, scanRegion } from "../extract";
import {
  ACTIVE_REGIONS, EPC_KEYWORDS, INDUSTRY_TERMS, ORG_INDUSTRY, PUBLIC_OWNER_PATTERN, SIGNAL_POINTS,
  type SignalType,
} from "../taxonomy";
import { OWNER_UNNAMED as OWNER_NOT_NAMED } from "../../outreach";
import type { OfficialRecord } from "./types";

const DAY_MS = 86_400_000;

// Government departments, agencies and First Nations that PUBLIC_OWNER_PATTERN does not already cover.
const PUBLIC_PROPONENT = /\b(parks canada|national defence|public services and procurement|pspc|indigenous services|transport canada|fisheries and oceans|national capital commission|first nations?|cree nation|band|métis|metis|regional district|municipal district|district of)\b|^(city|town|county|village) /i;

// Registers sometimes hold a placeholder where a company belongs ("External").
const PLACEHOLDER_NAME = /^(external|n\/?a|none|unknown|tbd|various|not (?:applicable|available|specified))$/i;

// The register's own category (or a permit's class) mapped onto the industry filters.
const CATEGORY_INDUSTRY: [RegExp, string][] = [
  [/petroleum|oil|natural gas|energy|electric|power|pipeline|substation|transformer/i, "Energy"],
  [/mining|mines|mineral|coal|quarr/i, "Mining"],
  [/water|sewage|wastewater|treatment|pump/i, "Water"],
  [/terminal|airport|transport|bridge|transit|rail|road|manufactur|utilit/i, "Infrastructure"],
];

/**
 * Turns one official record into a candidate lead with the same explainable factors as a headline.
 * Like buildCandidate it returns an unvalidated object: LeadSchema decides whether it gets in.
 */
export function buildOfficialCandidate(rec: OfficialRecord, now: Date = new Date()): Record<string, unknown> {
  const text = `${rec.title} ${rec.category} ${rec.description.slice(0, 800)}`;
  const region = rec.region && ACTIVE_REGIONS.includes(rec.region) ? rec.region : undefined;
  const place = region ? scanRegion(rec.placeText).place : undefined;

  // The register names the owner, so it is trusted as given (a known company keeps its usual short name).
  let organization = OWNER_NOT_NAMED;
  let organizationKnown = false;
  if (rec.organization && !PLACEHOLDER_NAME.test(rec.organization.trim())) {
    const known = detectOrganization(rec.organization);
    organization = known.known ? known.name : rec.organization.replace(/\s*\([^)]*\)\s*$/, "").trim().slice(0, 120);
    organizationKnown = organization.length > 0;
    if (!organizationKnown) organization = OWNER_NOT_NAMED;
  }
  // A regulator's proponent is the owner. A permit's applicant may be the owner, a builder or a designer, so no
  // owner type (and no owner points) is claimed for it.
  const ownerType: "Private" | "Public" | "Unclear" =
    !organizationKnown || rec.origin === "Permit" ? "Unclear" : PUBLIC_OWNER_PATTERN.test(organization) || PUBLIC_PROPONENT.test(organization) ? "Public" : "Private";
  const contractors = rec.contractors.filter((c) => c !== organization);

  const signalType: SignalType = rec.origin === "Permit" ? "Building permit" : "Regulatory milestone";
  const keywords = found(text, EPC_KEYWORDS);
  // Industry comes from the register's own category. Only when the category says nothing is the project's name read
  // for industry words. The long description is left out on purpose: a subdivision or a police station mentions
  // "grid" or "hydro" without being energy work, and "terminal" in a permit means a bus stop, not an LNG terminal.
  const industryTags = CATEGORY_INDUSTRY.filter(([pattern]) => pattern.test(rec.category)).map(([, tag]) => tag);
  if (!industryTags.length && rec.origin !== "Permit") industryTags.push(...Object.entries(INDUSTRY_TERMS).filter(([, terms]) => found(rec.title, terms).length).map(([tag]) => tag));
  const orgIndustry = ORG_INDUSTRY[organization];
  if (orgIndustry && !industryTags.includes(orgIndustry)) industryTags.push(orgIndustry);

  const dated = rec.date ? new Date(rec.date) : null;
  const ageDays = dated ? Math.max(0, (now.getTime() - dated.getTime()) / DAY_MS) : null;
  // A register with no change date earns little freshness: it may have listed the project years ago.
  const recency = ageDays === null ? 3 : ageDays <= 3 ? 15 : ageDays <= 7 ? 11 : ageDays <= 14 ? 7 : ageDays <= 30 ? 3 : 0;

  const reasons: { text: string; kind: "match" | "constraint"; factor?: FactorKey; points?: number }[] = [];
  let score = 0;
  if (region) {
    score += 20;
    reasons.push({ text: `Located in ${place ? `${place}, ` : ""}${region} (per the ${rec.publisher} record)`, kind: "match", factor: "region", points: 20 });
  }
  const signalPoints = SIGNAL_POINTS[signalType];
  score += signalPoints;
  reasons.push({ text: `${signalType} signal: ${rec.stage}`, kind: "match", factor: "signal", points: signalPoints });
  if (keywords.length) {
    const keywordPoints = Math.min(20, keywords.length * 5);
    score += keywordPoints;
    reasons.push({ text: `Matches EPCMst keywords: ${keywords.slice(0, 4).join(", ")}`, kind: "match", factor: "keywords", points: keywordPoints });
  }
  score += recency;
  reasons.push({
    text: ageDays === null ? "On the register, which gives no date for when it was added" : ageDays < 1 ? "Recorded today" : `Recorded ${Math.floor(ageDays)} day${Math.floor(ageDays) === 1 ? "" : "s"} ago`,
    kind: recency >= 7 ? "match" : "constraint",
    factor: "recency",
    points: recency,
  });
  if (rec.value) {
    const valuePoints = rec.value >= 1e9 ? 12 : rec.value >= 1e8 ? 9 : rec.value >= 1e7 ? 5 : 2;
    score += valuePoints;
    reasons.push({ text: `Stated value ${formatMoney(rec.value)}`, kind: "match", factor: "value", points: valuePoints });
  } else {
    reasons.push({ text: "No project value stated in the record", kind: "constraint", factor: "value", points: 0 });
  }
  if (contractors.length) {
    score += 8;
    reasons.push({ text: `Contractor named: ${contractors.slice(0, 3).join(", ")}`, kind: "match", factor: "contractor", points: 8 });
  }
  if (ownerType === "Private") {
    score += 5;
    reasons.push({ text: "Private-sector owner, where work is awarded to approved vendors by private RFP", kind: "match", factor: "owner", points: 5 });
  } else if (ownerType === "Public") {
    score -= 8;
    reasons.push({ text: "Public-sector owner: this is usually a public tender, not the private work EPCMst is aiming at", kind: "constraint", factor: "owner", points: -8 });
  }
  if (!organizationKnown) reasons.push({ text: `Owner is not named in the ${rec.publisher} record`, kind: "constraint" });
  else if (rec.origin === "Permit") reasons.push({ text: `Applicant on the permit: ${organization} (not necessarily the owner)`, kind: "constraint" });
  reasons.push({
    text: rec.origin === "Permit"
      ? "Permit signal only: the owner (if not named) and the people on the project still need confirming"
      : "Register signal only: the contractors and the people on the project still need confirming",
    kind: "constraint",
  });

  const idPrefix = rec.origin === "Permit" ? "prm" : "reg";
  return {
    id: `${idPrefix}-${hash(`${rec.source}:${rec.recordId}`)}`,
    title: rec.title,
    sourceUrl: rec.link,
    publisher: rec.publisher,
    publishedAt: (dated ?? now).toISOString(),
    region,
    location: place ?? region ?? "",
    organization,
    organizationKnown,
    ownerType,
    contractors,
    industryTags,
    signalType,
    keywords,
    score: Math.max(0, Math.min(100, score)),
    estimatedValue: rec.value,
    origin: rec.origin,
    detail: {
      overview: rec.overview,
      stage: rec.stage,
      stageNote: rec.stageNote,
      documentName: rec.documentName,
      timing: dated ? `Recorded ${dated.toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" })}` : "On the register",
      dateLine: dated ? `Recorded ${dated.toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}` : `Listed on the ${rec.publisher} register`,
      sizeNote: rec.sizeNote,
    },
    reasons,
  };
}
