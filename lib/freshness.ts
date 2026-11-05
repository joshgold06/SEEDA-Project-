// A lead's score reasons are written when it is first scanned, so "Published 1 day ago" would still be there a week
// later. Freshness (and a tender's days left) are therefore worked out again from the date saved with the lead each
// time it is loaded, so an older lead can never look more urgent than it is.

const DAY_MS = 86_400_000;

/** Points for how recent a lead is. The same steps are used when a lead is first scored. */
export const freshnessPoints = (ageDays: number) => (ageDays <= 3 ? 15 : ageDays <= 7 ? 11 : ageDays <= 14 ? 7 : ageDays <= 30 ? 3 : 0);

export function freshnessText(ageDays: number, verb: "Published" | "Recorded"): string {
  const days = Math.floor(ageDays);
  return ageDays < 1 ? `${verb} today` : `${verb} ${days} day${days === 1 ? "" : "s"} ago`;
}

/** "Published October 22, 2026" (or Recorded / Closes) -> that date at midnight UTC. */
function labelledDate(text: string | null | undefined, label: string): Date | null {
  const m = text?.match(new RegExp(`${label}\\s+([A-Z][a-z]+ \\d{1,2}, \\d{4})`));
  if (!m) return null;
  const d = new Date(`${m[1]} 00:00:00 UTC`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Tenders saved before their date line carried the publication date: "Recorded 8 days ago" written when the lead
 * was found on a known day still pins the publication date (found day minus 8).
 */
function publishedFromSavedText(lead: Freshenable): Date | null {
  if (lead.type !== "Tender" || !lead.createdAt) return null;
  const text = lead.relevance?.find((r) => r.factor === "recency")?.text ?? "";
  const days = /\b(\d+) days? ago\b/.exec(text);
  const found = new Date(lead.createdAt);
  if (Number.isNaN(found.getTime())) return null;
  if (days) return new Date(found.getTime() - Number(days[1]) * DAY_MS);
  return /today/i.test(text) ? found : null;
}

type Reason ={ text: string; kind: "match" | "constraint"; strong?: string; factor?: string; points?: number };

export interface Freshenable {
  type: string;
  deadlineText?: string | null;
  createdAt?: string | null;
  relevance?: Reason[] | null;
  score: number;
  daysLeft: number | null;
}

export interface Freshened {
  relevance: Reason[] | undefined;
  score: number;
  daysLeft: number | null;
  /** A tender whose closing date has passed. */
  closed: boolean;
}

/** Recomputes freshness, the closing countdown, the score and days left as of `now`. Leads without a saved date keep what they had. */
export function freshen(lead: Freshenable, now: Date = new Date()): Freshened {
  let relevance: Reason[] | undefined = lead.relevance ?? undefined;
  let score = lead.score;
  let daysLeft = lead.daysLeft;
  let closed = false;

  const published = labelledDate(lead.deadlineText, "(?:Published|Recorded)") ?? publishedFromSavedText(lead);
  const closes = lead.type === "Tender" ? labelledDate(lead.deadlineText, "Closes") : null;

  if (relevance) {
    relevance = relevance.map((r): Reason => {
      if (published && r.factor === "recency") {
        const age = Math.max(0, (now.getTime() - published.getTime()) / DAY_MS);
        const points = freshnessPoints(age);
        return { ...r, text: freshnessText(age, lead.type === "News" || lead.type === "Tender" ? "Published" : "Recorded"), kind: points >= 7 ? "match" : "constraint", points };
      }
      if (closes && /^Closes in /.test(r.text)) {
        const left = Math.ceil((closes.getTime() + DAY_MS - now.getTime()) / DAY_MS);
        return left > 0
          ? { ...r, text: `Closes in ${left} day${left === 1 ? "" : "s"}${left <= 7 ? ": a short window to respond" : ""}`, kind: left <= 7 ? "constraint" : "match" }
          : { ...r, text: "This tender has closed", kind: "constraint" };
      }
      return r;
    });
    const scored = relevance.filter((r) => r.factor && typeof r.points === "number");
    if (scored.length >= 3) score = Math.max(0, Math.min(100, Math.round(scored.reduce((sum, r) => sum + (r.points ?? 0), 0))));
  }
  if (closes) {
    daysLeft = Math.ceil((closes.getTime() + DAY_MS - now.getTime()) / DAY_MS);
    closed = daysLeft <= 0;
  }
  return { relevance, score, daysLeft, closed };
}
