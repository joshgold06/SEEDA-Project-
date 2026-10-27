import type { Opportunity } from "../data";

const STOP = new Set(["the", "and", "for", "with", "from", "its", "new", "says", "after", "will", "has", "have", "this", "that", "into", "over", "more", "than", "about", "could", "would"]);
const words = (text: string) => new Set(text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

/**
 * The best `count` leads, in the order given, skipping any that tell the same story as one already
 * chosen (same named owner, or most headline words shared). Without this, five outlets reporting one
 * groundbreaking would use up all five researches on a single project.
 */
export function pickDistinct(ranked: Opportunity[], count: number): Opportunity[] {
  const chosen: { lead: Opportunity; words: Set<string> }[] = [];
  for (const lead of ranked) {
    if (chosen.length >= count) break;
    const w = words(lead.fullTitle ?? lead.title);
    const ownerNamed = lead.owner && lead.owner !== "Not identified in headline" && lead.owner !== "Unknown owner";
    const repeat = chosen.some((c) => {
      const shared = [...w].filter((x) => c.words.has(x)).length;
      const overlap = shared / Math.max(1, Math.min(w.size, c.words.size));
      // One shared word is a coincidence; two or more with a fair share of the headline is the same story.
      return shared >= 2 && ((ownerNamed && c.lead.owner === lead.owner && overlap >= 0.2) || overlap >= 0.3);
    });
    if (!repeat) chosen.push({ lead, words: w });
  }
  return chosen.map((c) => c.lead);
}
