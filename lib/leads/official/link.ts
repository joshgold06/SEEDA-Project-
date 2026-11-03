import type { Lead } from "../schema";
import { findSameProject, regionFromLocation, type KnownListing } from "./sameProject";

export type SourceDoc = { name: string; kind: "pdf" | "doc"; url?: string };

/** A saved regulatory lead, as read back from the database. */
export interface SavedListing extends KnownListing {
  documents: SourceDoc[];
  overview: string;
}

export function savedListing(row: { id: string; title: string; full_title: string | null; location: string; overview: string | null; documents: SourceDoc[] | null; involved: { primary?: string } | null }): SavedListing {
  return {
    id: row.id,
    title: row.full_title ?? row.title,
    region: regionFromLocation(row.location),
    owner: row.involved?.primary ?? "",
    documents: row.documents ?? [],
    overview: row.overview ?? "",
  };
}

export interface SplitResult {
  /** Leads that are new projects. */
  kept: Lead[];
  /** Leads that are the same project as one already saved, with that saved lead. */
  links: { saved: SavedListing; lead: Lead }[];
  /** Leads dropped because another lead in this same run is the same project. */
  droppedInRun: number;
}

/** Splits new regulatory leads into new projects and listings of a project that is already saved. Permits are never matched. */
export function splitSameProject(fresh: Lead[], saved: SavedListing[]): SplitResult {
  const kept: Lead[] = [];
  const links: SplitResult["links"] = [];
  let droppedInRun = 0;
  for (const lead of fresh) {
    if (lead.origin !== "Regulatory") {
      kept.push(lead);
      continue;
    }
    const inRun: KnownListing[] = kept.filter((k) => k.origin === "Regulatory").map((k) => ({ id: k.id, title: k.title, region: k.region, owner: k.organization }));
    const twin = findSameProject(lead, [...saved, ...inRun]);
    if (!twin) kept.push(lead);
    else if (saved.some((s) => s.id === twin.id)) links.push({ saved: twin as SavedListing, lead });
    else droppedInRun++;
  }
  return { kept, links, droppedInRun };
}

/**
 * What to add to a saved lead so it also points at the other register's listing of the same project.
 * Null when it already does, so running the scan again changes nothing.
 */
export function linkPatch(saved: SavedListing, lead: Lead): { documents: SourceDoc[]; overview: string } | null {
  if (saved.documents.some((d) => d.url === lead.sourceUrl)) return null;
  const stage = lead.detail?.stage ? `: ${lead.detail.stage}` : "";
  return {
    documents: [...saved.documents, { name: lead.detail?.documentName ?? `${lead.publisher} listing`, kind: "doc", url: lead.sourceUrl }],
    overview: `${saved.overview} Also listed by ${lead.publisher}${stage}.`.trim(),
  };
}
