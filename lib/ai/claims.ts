// What the email writer may say about the sender's company, and a check that a draft claims no experience beyond it.
// Nothing here imports other code, so it can be checked on its own.

export const COMPANY_FACTS = `About the sender's company (the only things you may claim about it):
- SEEDA's EPCMst network connects project teams with pre-vetted specialists for short-term, targeted input. It is for teams that already cover most of what they need and want the remaining expertise without a long engagement.
- SEEDA runs SeeRem, its own platform that gives project owners real-time, auditable field data during execution.
- SEEDA has supported heavy industrial EPC projects across North America and globally, full-scope pipeline infrastructure developments across challenging terrain, and engineering and technical advisory support for upstream and midstream facilities, including skid fabrication and modular station field integration.`;

const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);

const FACT_WORDS = new Set(words(COMPANY_FACTS));
// Words that can surround a claim without adding anything to it.
const FILLER = new Set(
  ("a an the and or of in on at to for with across including such as like this that these those your yours you our their its it we us " +
    "similar other many several both also work works project projects team teams area areas sector sectors kind type well which where who " +
    "can could may might help helps support supports supporting during from by is are be been has have").split(" ")
);

// "our work in ...", "SEEDA's experience with ...", "we have supported ...", "we have worked on ...".
const CLAIM =
  /\b(?:(?:our|seeda(?:['’]s)?)\s+(?:(?:past|prior|deep|extensive|proven|strong|recent)\s+)?(?:work|experience|expertise|track record|background|history)\s+(?:in|on|with|across)|(?:we|seeda)\s+(?:(?:have|has)\s+)?(?:(?:(?:deep|extensive|proven|strong)\s+)?(?:experience|expertise)\s+(?:in|on|with|across)|worked\s+(?:on|in|with|across)|supported|delivered|completed|specializ[a-z]+\s+in))\s+([^.;!?\n]+)/gi;

/**
 * The subjects a draft claims experience in that the company facts don't cover. Every meaningful word of a claim has to
 * appear in the facts, so a project's own category ("municipal infrastructure") cannot turn into the sender's history.
 */
export function unsupportedClaims(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(CLAIM)) {
    for (const w of words(match[1])) if (!FACT_WORDS.has(w) && !FILLER.has(w)) found.add(w);
  }
  return [...found];
}
