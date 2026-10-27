import { z } from "zod";

// "Research this lead" reads public web pages about a lead and proposes an owner, contractors and
// named people. Every proposal carries the sentence it came from and a link, and nothing becomes
// part of the lead until the person accepts it.

export const FINDING_KINDS = ["owner", "contractor", "person"] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export const FindingSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(FINDING_KINDS),
  name: z.string().min(2).max(120),
  role: z.string().max(120).optional(),
  company: z.string().max(120).optional(),
  evidence: z.string().min(10).max(500),
  sourceUrl: z.url(),
  sourceTitle: z.string().max(200),
});
export type Finding = z.infer<typeof FindingSchema>;

export const SourceSchema = z.object({ url: z.url(), title: z.string().max(200) });
export type Source = z.infer<typeof SourceSchema>;

export const FindingsDocSchema = z.object({
  findings: z.array(FindingSchema).max(40),
  sources: z.array(SourceSchema).max(20),
});
export type FindingsDoc = z.infer<typeof FindingsDocSchema>;

export const AcceptedSchema = z.object({
  owner: z.object({ name: z.string().max(120), sourceUrl: z.string().max(500) }).nullable(),
  contractors: z.array(z.object({ name: z.string().max(120), sourceUrl: z.string().max(500) })).max(20),
});
export type Accepted = z.infer<typeof AcceptedSchema>;

export const NO_ACCEPTED: Accepted = { owner: null, contractors: [] };

export interface ResearchRow {
  opportunityId: string;
  doc: FindingsDoc;
  accepted: Accepted;
  dismissed: string[];
  researchedAt: number;
}

export type ResearchDbRow = {
  opportunity_id: string;
  findings: unknown;
  accepted: unknown;
  dismissed: unknown;
  researched_at: string;
};

/** Reads a database row back into the app shape, dropping anything that no longer validates. */
export function rowToResearch(row: ResearchDbRow): ResearchRow {
  const doc = FindingsDocSchema.safeParse(row.findings);
  const accepted = AcceptedSchema.safeParse(row.accepted);
  return {
    opportunityId: row.opportunity_id,
    doc: doc.success ? doc.data : { findings: [], sources: [] },
    accepted: accepted.success ? accepted.data : NO_ACCEPTED,
    dismissed: Array.isArray(row.dismissed) ? row.dismissed.filter((d): d is string => typeof d === "string").slice(0, 200) : [],
    researchedAt: new Date(row.researched_at).getTime(),
  };
}

/** The same finding found again (even in a later run) keeps the same id, so a dismissal sticks. */
export function findingId(kind: FindingKind, name: string): string {
  const key = `${kind}:${name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) >>> 0;
  return `${kind[0]}-${h.toString(36)}`;
}

export const safeHttpUrl = (raw: string): string | null => {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
};

export const domainOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
