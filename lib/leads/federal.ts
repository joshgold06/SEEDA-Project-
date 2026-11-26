// In Canadian headlines "Ottawa" often means the federal government, not the city: "Ottawa approves B.C. pipeline" says
// nothing about where the pipeline is. Those uses are taken out before a headline is read for its location, so a
// project is not filed under Ottawa, Ontario because the government acted on it. Nothing here imports other code, so it
// can be checked on its own.

// Things a government does. A city name followed by one of these is being used for the government.
const ACTION =
  "(?:approv|back|say|said|announc|commit|suppl|pledg|invest|fund|financ|giv|offer|green-?light|reject|delay|designat|fast-?track|push|urg|sign|reach|strik|want|propos|weigh|vow|promis|earmark|tout|unveil|clear|okay|mull|eye|invok|pick|seek|defend|press|consider|support|tell|order|block|add|move|put|tap|name)";
const HELPER = "(?:has|have|will|would|to|just|now|formally|officially|quietly|may|might|could|is|set to|expected to|reportedly)";
const PROVINCES = "(?:alberta|b\\.?c\\.?|british columbia|ontario|saskatchewan|manitoba|the provinces?)";

const ACTS = new RegExp(
  `\\bottawa(?:['\\u2019]s)?(?=\\s+(?:and\\s+${PROVINCES}(?![a-z])|(?:${HELPER}\\s+){0,2}${ACTION}[a-z]*\\b)|[-\\u2013]${PROVINCES}\\s+(?:deal|agreement|accord|pact|mou|plan)\\b)`,
  "gi"
);
// "approval from Ottawa", "funding by Ottawa".
const ACTED_ON = /\b((?:approv[a-z]*|funding|money|support|backing|cash|decision|greenlight)\s+(?:from|by))\s+ottawa\b/gi;

/** The headline with every use of "Ottawa" that means the federal government replaced, for reading locations only. */
export const withoutFederalOttawa = (title: string) => title.replace(ACTS, "the federal government").replace(ACTED_ON, "$1 the federal government");
