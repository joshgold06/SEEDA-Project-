import type { FactorKey, Opportunity } from "../data";
import { CONTRACTOR_PREFIX } from "./people";
import type { NewsItem } from "./googleNews";
import type { Lead } from "./schema";
import {
  EPC_KEYWORDS, INDUSTRY_TERMS, KNOWN_CONTRACTORS, KNOWN_ORGANIZATIONS, NOISE_TERMS, ORG_INDUSTRY,
  PUBLIC_OWNER_PATTERN, REGION_ABBR, REGION_TERMS,
  SERVICE_LINE, SIGNAL_PHASE_TAG, SIGNAL_POINTS, SIGNAL_TERMS, SIGNAL_TYPES, ACTIVE_REGIONS,
  type SignalType, type WesternRegion,
} from "./taxonomy";

const DAY_MS = 86_400_000;
const regexCache = new Map<string, RegExp>();

function has(text: string, term: string): boolean {
  let re = regexCache.get(term);
  if (!re) {
    re = new RegExp(`(?<![a-z0-9])${term}(?![a-z0-9])`, "i");
    regexCache.set(term, re);
  }
  return re.test(text);
}

const found = (text: string, terms: string[]) => terms.filter((t) => has(text, t));

function scanRegion(text: string): { region?: WesternRegion; place?: string } {
  let best: { region: WesternRegion; hits: number; place?: string } | undefined;
  for (const region of ACTIVE_REGIONS) {
    const hits = REGION_TERMS[region].filter((r) => has(text, r.term));
    if (!hits.length) continue;
    if (!best || hits.length > best.hits) best = { region, hits: hits.length, place: hits.find((h) => h.place)?.place };
  }
  return best ? { region: best.region, place: best.place } : {};
}

// A local outlet ("Calgary Herald", "Red Deer Advocate") is a fair hint when the headline
// itself leaves the place out, so the publisher is only consulted as a fallback.
function detectRegion(title: string, publisher: string): { region?: WesternRegion; place?: string; viaPublisher: boolean } {
  const fromTitle = scanRegion(title);
  if (fromTitle.region) return { ...fromTitle, viaPublisher: false };
  return { ...scanRegion(publisher), viaPublisher: true };
}

function detectOrganization(title: string): { name: string; known: boolean } {
  const knownHits = KNOWN_ORGANIZATIONS.filter((o) => has(title, o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  if (knownHits.length) return { name: knownHits.sort((a, b) => b.length - a.length)[0], known: true };
  const civic = title.match(/\b(City|Town|County|Municipality|Village) of ([A-Z][\w.'-]+(?: [A-Z][\w.'-]+)?)/);
  if (civic) return { name: civic[0], known: true };
  return { name: "Not identified in headline", known: false };
}

function detectValue(title: string): number | undefined {
  const m = title.match(/\$\s?(\d+(?:\.\d+)?)[\s-]?(billion|million|bn|b|m)\b/i);
  if (!m) return undefined;
  const unit = m[2].toLowerCase();
  return Math.round(Number(m[1]) * (unit.startsWith("b") ? 1e9 : 1e6));
}

export function formatMoney(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
  return `$${Math.round(n / 1e6)}M`;
}

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Turns one news item into a candidate lead with an explainable, rule-based score.
 * Returns an unvalidated object on purpose: LeadSchema is the gate that decides
 * whether it is allowed in.
 */
export function buildCandidate(item: NewsItem, now: Date = new Date()): Record<string, unknown> {
  const title = item.title;
  const { region, place, viaPublisher } = detectRegion(title, item.publisher);
  const org = detectOrganization(title);
  const estimatedValue = detectValue(title);
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const contractors = KNOWN_CONTRACTORS.filter((c) => has(title, escape(c)) && c !== org.name);
  // "Surerus Murphy wins first land construction contract..." names a contractor that
  // is not on the known list. Only trusted when the headline is about a contract.
  if (/\b(contract|awarded)\b/i.test(title)) {
    const winner = title.match(/^([A-Z][\w&.'-]*(?: [A-Z][\w&.'-]*){0,3}) (?:wins|secures|lands|is awarded|awarded|selected)\b/);
    const name = winner?.[1];
    const generic = /^(the|province|city|town|company|government|alberta|british columbia|saskatchewan|ottawa|canada|feds|federal)\b/i;
    if (name && !generic.test(name) && !PUBLIC_OWNER_PATTERN.test(name) && !contractors.includes(name) && name !== org.name) contractors.push(name);
  }
  const ownerType: "Private" | "Public" | "Unclear" = !org.known
    ? "Unclear"
    : PUBLIC_OWNER_PATTERN.test(org.name) || /\b(city|town|county)\b/i.test(org.name)
      ? "Public"
      : "Private";

  const signalHits = SIGNAL_TYPES.map((type) => ({ type, hits: found(title, SIGNAL_TERMS[type]) })).filter((s) => s.hits.length);
  const signalType: SignalType | undefined = [...signalHits].sort((a, b) => SIGNAL_POINTS[b.type] - SIGNAL_POINTS[a.type])[0]?.type;
  const keywords = found(title, EPC_KEYWORDS);
  const industryTags = Object.entries(INDUSTRY_TERMS).filter(([, terms]) => found(title, terms).length).map(([tag]) => tag);
  const orgIndustry = ORG_INDUSTRY[org.name];
  if (orgIndustry && !industryTags.includes(orgIndustry)) industryTags.push(orgIndustry);
  const noisy = found(title, NOISE_TERMS).length > 0;
  const ageDays = Math.max(0, (now.getTime() - new Date(item.publishedAt).getTime()) / DAY_MS);

  const reasons: { text: string; kind: "match" | "constraint"; factor?: FactorKey; points?: number }[] = [];
  let score = 0;

  if (region) {
    score += 20;
    reasons.push({ text: `Located in ${place ? `${place}, ` : ""}${region}${viaPublisher ? " (inferred from the local publisher)" : ""}`, kind: "match", factor: "region", points: 20 });
  }
  if (signalType) {
    const signalPoints = SIGNAL_POINTS[signalType] + (signalHits.length > 1 ? 4 : 0);
    score += signalPoints;
    reasons.push({ text: `${signalType} signal: ${signalHits.find((s) => s.type === signalType)!.hits.slice(0, 3).join(", ")}`, kind: "match", factor: "signal", points: signalPoints });
  }
  if (keywords.length) {
    const keywordPoints = Math.min(20, keywords.length * 5);
    score += keywordPoints;
    reasons.push({ text: `Matches EPCMst keywords: ${keywords.slice(0, 4).join(", ")}`, kind: "match", factor: "keywords", points: keywordPoints });
  }
  const recency = ageDays <= 3 ? 15 : ageDays <= 7 ? 11 : ageDays <= 14 ? 7 : ageDays <= 30 ? 3 : 0;
  score += recency;
  reasons.push({ text: ageDays < 1 ? "Published today" : `Published ${Math.floor(ageDays)} day${Math.floor(ageDays) === 1 ? "" : "s"} ago`, kind: recency >= 7 ? "match" : "constraint", factor: "recency", points: recency });
  if (estimatedValue) {
    const valuePoints = estimatedValue >= 1e9 ? 12 : estimatedValue >= 1e8 ? 9 : estimatedValue >= 1e7 ? 5 : 2;
    score += valuePoints;
    reasons.push({ text: `Stated value ${formatMoney(estimatedValue)}`, kind: "match", factor: "value", points: valuePoints });
  } else {
    reasons.push({ text: "No project value stated in the headline", kind: "constraint", factor: "value", points: 0 });
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
  if (!org.known) reasons.push({ text: "Owner is not named in the headline", kind: "constraint" });
  if (noisy) {
    score = Math.min(score, 30); // cap rather than subtract, so a noisy headline can never clear MIN_SCORE
    reasons.push({ text: "Reads like financial or general news, not a project signal", kind: "constraint" });
  }
  reasons.push({ text: "News signal only: the owner, contractors and the people on the project still need confirming", kind: "constraint" });

  return {
    id: `sig-${hash(title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 70))}`,
    title,
    sourceUrl: item.link,
    publisher: item.publisher,
    publishedAt: item.publishedAt,
    region,
    location: place ?? region ?? "",
    organization: org.name,
    organizationKnown: org.known,
    ownerType,
    contractors,
    industryTags,
    signalType,
    keywords,
    score: Math.max(0, Math.min(100, score)),
    estimatedValue,
    reasons,
  };
}

const STOP_WORDS = new Set(["the", "and", "for", "with", "from", "its", "new", "says", "after", "will", "has", "have", "this", "that", "into", "over", "more", "than", "about", "could", "would"]);
const wordSet = (text: string) => new Set(text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w)));

/**
 * One story is usually reported by many outlets with different headlines. Keep the
 * highest-scoring version and drop headlines that share most of its words, unless
 * they name a different company.
 */
export function dedupeLeads(leads: Lead[]): Lead[] {
  const kept: { lead: Lead; words: Set<string> }[] = [];
  for (const lead of [...leads].sort((a, b) => b.score - a.score)) {
    const words = wordSet(lead.title);
    const duplicate = kept.some((k) => {
      const bothKnown = k.lead.organizationKnown && lead.organizationKnown;
      if (bothKnown && k.lead.organization !== lead.organization) return false;
      const shared = [...words].filter((w) => k.words.has(w)).length;
      // The same named company in the same period is very likely the same story.
      const threshold = bothKnown ? 0.35 : 0.6;
      return shared / Math.max(1, Math.min(words.size, k.words.size)) >= threshold;
    });
    if (!duplicate) kept.push({ lead, words });
  }
  return kept.map((k) => k.lead);
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Maps a validated lead onto the Opportunity shape the whole app already renders. */
export function toOpportunity(lead: Lead, assignee: string): Opportunity {
  const tag = lead.industryTags[0];
  const place = lead.location === lead.region ? lead.region : `${lead.location}, ${REGION_ABBR[lead.region]}`;
  return {
    id: lead.id,
    ref: `SIG-${lead.id.slice(4, 10).toUpperCase()}`,
    type: "News",
    score: lead.score,
    title: lead.title.length > 110 ? `${lead.title.slice(0, 107)}...` : lead.title,
    fullTitle: lead.title,
    owner: lead.organization,
    location: place,
    timing: `Published ${shortDate(lead.publishedAt)}`,
    timingIcon: "calendar",
    daysLeft: null,
    phaseTag: SIGNAL_PHASE_TAG[lead.signalType],
    inScan: true,
    stage: null,
    watched: false,
    dismissed: false,
    value: lead.estimatedValue,
    category: lead.industryTags.join(" / "),
    sourceId: lead.publisher,
    deadlineText: `Published ${longDate(lead.publishedAt)}`,
    overview: `${lead.title}. Reported by ${lead.publisher} on ${longDate(lead.publishedAt)}. The news feed gives only the headline, so open the source article for the full story.`,
    insight: `${lead.signalType} in ${place}${lead.organizationKnown ? ` involving ${lead.organization}` : ""}. Next step: confirm who owns and builds it, then find the people on the project. (Generated by rules from the headline, not by an AI model.)`,
    matchPercent: lead.score,
    relevance: lead.reasons,
    involved: {
      primary: lead.organization,
      secondary: lead.contractors.length
        ? `${CONTRACTOR_PREFIX}${lead.contractors.join(", ")}`
        : lead.organizationKnown ? `${lead.ownerType} owner, named in the headline` : "Not named in the headline",
    },
    projectType: { primary: lead.signalType, secondary: lead.keywords.slice(0, 3).join(", ") || "No EPC keywords matched" },
    scale: { primary: lead.estimatedValue ? `${formatMoney(lead.estimatedValue)} stated` : "Not stated", secondary: lead.estimatedValue ? "Parsed from the headline" : "Check the source article" },
    currentStage: { primary: "News signal", secondary: `via ${lead.publisher}` },
    documents: [{ name: `${lead.publisher} article`, kind: "doc", url: lead.sourceUrl }],
    serviceLine: SERVICE_LINE[tag] ?? "engineering, procurement and construction",
    pipelineTime: "Just added",
    assignee,
    contactRole: lead.organizationKnown ? undefined : "project team",
  };
}
