import type { Opportunity } from "./data";
import { formatMoney } from "./leads/extract";
import { regionFromLocation } from "./leads/official/sameProject";

// One project is usually reported by several outlets, and a new scan saves each differently worded headline as its
// own lead. This finds the other leads that look like the same project, so a person is warned before contacting one
// company twice. It is a hint, not a merge: the match is a guess from the headlines, so nothing is hidden or blocked.

const STOP = new Set(["the", "and", "for", "with", "from", "its", "new", "says", "after", "will", "has", "have", "this", "that", "into", "over", "more", "than", "about", "could", "would"]);
const COMMON_AT = 0.06; // a word in more than 6% of leads (natural, gas, pipeline, approves...) doesn't identify a project
const MIN_VALUE = 100_000_000;

export interface RelatedLead {
  lead: Opportunity;
  /** Why it looks like the same project, in plain words. */
  reason: string;
  shared: number;
}

const wordsOf = (o: Opportunity): Set<string> =>
  new Set(
    (o.fullTitle ?? o.title)
      .replace(/:\s*BC environmental assessment,.*$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !/^\d+$/.test(w) && !STOP.has(w))
  );

// Headlines and register listings can describe a project; permits and tenders are single jobs and are not compared.
const comparable = (o: Opportunity) => (o.type === "News" || o.type === "Regulatory") && !o.dismissed;

/** Builds the word statistics once for a set of leads and returns a lookup for one lead at a time. */
export function relatedIndex(all: Opportunity[]) {
  const pool = all.filter(comparable);
  const words = new Map(pool.map((o) => [o.id, wordsOf(o)] as const));
  const regions = new Map(pool.map((o) => [o.id, regionFromLocation(o.location)] as const));
  const df = new Map<string, number>();
  for (const set of words.values()) for (const w of set) df.set(w, (df.get(w) ?? 0) + 1);
  const common = (w: string) => (df.get(w) ?? 0) / Math.max(1, pool.length) > COMMON_AT;

  return (target: Opportunity): RelatedLead[] => {
    if (!comparable(target)) return [];
    const mine = words.get(target.id) ?? wordsOf(target);
    const region = regions.get(target.id) ?? regionFromLocation(target.location);
    if (!region) return [];
    const out: RelatedLead[] = [];
    for (const other of pool) {
      if (other.id === target.id || regions.get(other.id) !== region) continue;
      const theirs = words.get(other.id)!;
      const shared = [...mine].filter((w) => theirs.has(w));
      const distinct = shared.filter((w) => !common(w));
      const smaller = Math.min(mine.size, theirs.size);
      const bothValued = !!target.value && !!other.value;
      const sameValue = bothValued && Math.abs(target.value! - other.value!) / Math.max(target.value!, other.value!) <= 0.05 && target.value! >= MIN_VALUE;
      // Two different dollar figures mean two different projects, whatever the wording.
      if (bothValued && !sameValue) continue;
      let reason: string | null = null;
      if (sameValue && shared.length >= 2) reason = `Both give about ${formatMoney(target.value!)}`;
      else if (!bothValued && distinct.length >= 2 && shared.length >= 3 && shared.length / smaller >= 0.4) reason = `Both mention ${distinct.slice(0, 3).join(", ")}`;
      else if (!bothValued && distinct.length >= 1 && shared.length >= 4 && shared.length / smaller >= 0.5) reason = `Both mention ${distinct.slice(0, 3).join(", ")}`;
      if (reason) out.push({ lead: other, reason, shared: shared.length });
    }
    return out.sort((a, b) => b.shared - a.shared).slice(0, 5);
  };
}
