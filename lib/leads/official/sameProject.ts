import { REGION_ABBR, REGIONS, type Region } from "../taxonomy";

// One project is often on more than one register: a mine under both the federal and the BC assessment. This finds
// those pairs so the second listing is attached to the first lead instead of becoming a second lead.
// News is deliberately not matched: a story about a project in the register is usually a new event (an award, an
// approval), and hiding it behind the register entry would lose the signal.

// Words that every project has or that the registers add, so they say nothing about which project it is.
const GENERIC = new Set([
  "the", "and", "for", "with", "project", "projects", "program", "facility", "facilities", "plant", "station", "system",
  "expansion", "upgrade", "phase", "new", "development", "bc", "of",
]);

/** The words that identify a project, with the register's own tags (": BC environmental assessment, ...") removed. */
export function projectWords(title: string): Set<string> {
  const core = title.replace(/:\s*BC environmental assessment,.*$/i, "").replace(/:\s*\$[\d.]+[MB]\s+building permit$/i, "");
  return new Set(
    core
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !GENERIC.has(w))
  );
}

export interface KnownListing {
  id: string;
  title: string;
  region: Region | null;
  owner: string;
}

const ownerWords = (name: string) => new Set(name.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !/^(inc|ltd|limited|corp|corporation|company|partnership|partners|canada|group|the)$/.test(w)));
const overlaps = (a: Set<string>, b: Set<string>) => [...a].some((w) => b.has(w));

/** "Kitimat, BC" -> British Columbia; a bare province name works too. */
export function regionFromLocation(location: string): Region | null {
  const text = location.trim();
  const byName = REGIONS.find((r) => text === r || text.endsWith(`, ${r}`));
  if (byName) return byName;
  return REGIONS.find((r) => text.endsWith(`, ${REGION_ABBR[r]}`)) ?? null;
}

/**
 * The saved listing that is the same project as `candidate`, if there is one. Both must be in the same province,
 * every identifying word of the shorter title must appear in the longer one (and there must be at least two), and
 * the owners must not clearly differ.
 */
export function findSameProject(candidate: { title: string; region: Region; organization: string; organizationKnown: boolean }, known: KnownListing[]): KnownListing | undefined {
  const words = projectWords(candidate.title);
  if (words.size < 2) return undefined;
  return known.find((k) => {
    if (k.region !== candidate.region) return false;
    const other = projectWords(k.title);
    if (other.size < 2) return false;
    const [small, large] = words.size <= other.size ? [words, other] : [other, words];
    if (![...small].every((w) => large.has(w))) return false;
    const ownerKnown = candidate.organizationKnown && !!k.owner && !/^not (identified|named)/i.test(k.owner);
    return !ownerKnown || overlaps(ownerWords(candidate.organization), ownerWords(k.owner));
  });
}
