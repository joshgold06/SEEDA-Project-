import type { SupabaseClient } from "@supabase/supabase-js";
import type { Opportunity } from "../data";
import { LEAD_SELECT, opportunityToRow, rowToOpportunity, type OpportunityRow } from "../supabase/mappers";
import { relatedIndex } from "../related";
import { contractorNamedEvent, isStrongStoryMatch, newLeadEvent, newStoryEvent, recordEvents, stageChangeEvent, type LeadEventInput } from "./events";
import { CONTRACTOR_PREFIX } from "./people";
import { buildCandidate, dedupeLeads, toOpportunity } from "./extract";
import { fetchGoogleNews } from "./googleNews";
import { fetchOfficial, OFFICIAL_SOURCES, type OfficialSource } from "./official";
import { buildOfficialCandidate } from "./official/build";
import { linkPatch, savedListing, splitSameProject, type SplitResult } from "./official/link";
import { ensureOrganizations } from "./organizations";
import { LeadSchema, MIN_SCORE, MIN_TENDER_SCORE, type Lead } from "./schema";

// One scan of one source: read it, check and score every record, save the new ones, notice what changed in the ones
// already saved, and record the triggers. Used by the Find new signals buttons and by the daily scheduled run, so a
// person and the schedule do exactly the same work.

export type IngestSource = { official: OfficialSource } | { query: string };

export interface IngestOptions {
  /** Reads and writes leads and companies: the signed-in person's client, or the service client for the daily run. */
  db: SupabaseClient;
  /** The service client, for triggers and for updating leads the person didn't find. Null skips both. */
  admin: SupabaseClient | null;
  /** Who found the new leads, or null for the automatic run. */
  discoveredBy: string | null;
  assignee: string;
  /** Leads already known, shared between the scans of one run so they are read from the database once. */
  known?: Opportunity[];
}

export interface IngestResult {
  kind: "news" | "official";
  found: number;
  added: number;
  alreadySaved: number;
  duplicatesMerged: number;
  sameProjectLinked: number;
  /** Saved records whose stage or contractor changed and were brought up to date. */
  updated: number;
  /** Triggers recorded by this scan. */
  triggers: number;
  lowRelevance: number;
  rejected: number;
  rejectionReasons: Record<string, number>;
}

export class IngestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const MAX_NEW_LEADS = 12;
// A register holds many more relevant records than a news query returns, so one run may add more.
const MAX_NEW_OFFICIAL = 25;

interface ExistingRow {
  id: string;
  current_stage: { primary?: string } | null;
  involved: { secondary?: string } | null;
}

/** The columns a changed register record refreshes. The person's own choices and the lead's id are never touched. */
function refreshColumns(lead: Lead, assignee: string) {
  const row = opportunityToRow(toOpportunity(lead, assignee), { discoveredBy: "", organizationId: null });
  return {
    title: row.title,
    full_title: row.full_title,
    current_stage: row.current_stage,
    overview: row.overview,
    score: row.score,
    match_percent: row.match_percent,
    relevance: row.relevance,
    involved: row.involved,
    scale: row.scale,
    timing: row.timing,
    deadline_text: row.deadline_text,
    insight: row.insight,
    value: row.value,
  };
}

/** The saved news and register leads, read once per run so new stories can be matched to them. */
export async function loadKnown(db: SupabaseClient): Promise<Opportunity[]> {
  const { data } = await db.from("opportunities").select(LEAD_SELECT).in("type", ["News", "Regulatory"]);
  return ((data ?? []) as unknown as OpportunityRow[]).map((row) => rowToOpportunity(row));
}

export async function ingest(source: IngestSource, opts: IngestOptions): Promise<IngestResult> {
  const { db, admin, discoveredBy, assignee } = opts;
  const official = "official" in source ? source.official : undefined;

  // Both kinds of source end in the same list of candidates, so checking, scoring and saving are shared.
  let candidates: Record<string, unknown>[];
  try {
    candidates = official
      ? (await fetchOfficial(official)).map((record) => buildOfficialCandidate(record))
      : (await fetchGoogleNews((source as { query: string }).query)).map((item) => buildCandidate(item));
  } catch (err) {
    console.error("EPCMst: scan source failed", official ?? "news", err instanceof Error ? err.message : err);
    throw new IngestError(official ? `Couldn't reach the ${OFFICIAL_SOURCES[official].label} data. Try again in a minute.` : "Couldn't reach the news feed. Try again in a minute.", 502);
  }

  const valid: Lead[] = [];
  let rejected = 0;
  let lowRelevance = 0;
  const rejectionReasons: Record<string, number> = {};
  for (const candidate of candidates) {
    const result = LeadSchema.safeParse(candidate);
    if (!result.success) {
      rejected++;
      const reason = result.error.issues[0]?.message ?? "Failed validation";
      rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1;
    } else if (result.data.score < (result.data.origin === "Tender" ? MIN_TENDER_SCORE : MIN_SCORE)) {
      lowRelevance++;
    } else {
      valid.push(result.data);
    }
  }

  const events: LeadEventInput[] = [];
  let unique: Lead[];
  let picked: Lead[];
  let savedBefore = 0;
  let updated = 0;
  let links: SplitResult["links"] = [];
  let sameProjectInRun = 0;

  if (official) {
    unique = [...valid].sort((a, b) => b.score - a.score);
    // Checked in chunks so the request URL stays short.
    const ids = unique.map((l) => l.id);
    const chunks = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100));
    const checks = await Promise.all(chunks.map((chunk) => db.from("opportunities").select("id, current_stage, involved").in("id", chunk)));
    const have = new Map<string, ExistingRow>(checks.flatMap((r) => (r.data ?? []) as ExistingRow[]).map((row) => [row.id, row]));
    savedBefore = have.size;

    // A record already saved can change: the register moves it to a new stage, or names a contractor. Bring it up to
    // date and record what changed, so the person sees a trigger and not just a different label.
    for (const lead of unique) {
      const saved = have.get(lead.id);
      if (!saved) continue;
      const from = saved.current_stage?.primary;
      const to = lead.detail?.stage;
      const stageChanged = Boolean(from && to && from !== to);
      const contractorAdded = lead.contractors.length > 0 && !(saved.involved?.secondary ?? "").startsWith(CONTRACTOR_PREFIX);
      if (!stageChanged && !contractorAdded) continue;
      const { data } = await (admin ?? db).from("opportunities").update(refreshColumns(lead, assignee)).eq("id", lead.id).select("id");
      if (!data?.length) continue; // not the finder, and no service client: leave it
      updated++;
      if (stageChanged) events.push(stageChangeEvent(lead, from as string, to as string));
      if (contractorAdded) {
        const event = contractorNamedEvent(lead);
        if (event) events.push(event);
      }
    }

    // The same project can be on two registers (a mine under both the federal and the BC assessment): the second
    // listing is attached to the saved lead instead of becoming a second lead.
    const { data: savedRows } = await db.from("opportunities").select("id, title, full_title, location, overview, documents, involved").eq("type", "Regulatory");
    const split = splitSameProject(unique.filter((l) => !have.has(l.id)), (savedRows ?? []).map((r) => savedListing(r as Parameters<typeof savedListing>[0])));
    links = split.links;
    sameProjectInRun = split.droppedInRun;
    picked = split.kept.slice(0, MAX_NEW_OFFICIAL);
  } else {
    unique = dedupeLeads(valid);
    picked = unique.slice(0, MAX_NEW_LEADS);
  }

  // Each company is stored once in organizations; a lead points at it instead of repeating the name.
  const companies = new Map<string, "Private" | "Public" | "Unclear">();
  // A permit's applicant is not necessarily an owner, so only owners (named in headlines or by a regulator) get a row.
  for (const lead of picked) if (lead.organizationKnown && lead.origin !== "Permit") companies.set(lead.organization, lead.ownerType);
  const orgIds = await ensureOrganizations(db, [...companies].map(([name, owner_type]) => ({ name, owner_type })));

  const rows = picked.map((lead) => opportunityToRow(toOpportunity(lead, assignee), { discoveredBy, organizationId: orgIds.get(lead.organization) ?? null }));

  let added = 0;
  if (rows.length) {
    const { data, error } = await db.from("opportunities").upsert(rows, { onConflict: "id", ignoreDuplicates: true }).select("id");
    if (error) throw new IngestError(`Couldn't save the leads: ${error.message}`, 500);
    added = data?.length ?? 0;

    // Leads saved earlier keep the user's own choices (stage, watch, dismiss) but get
    // their scoring refreshed, so the score breakdown stays current as rules improve.
    const insertedIds = new Set((data ?? []).map((r: { id: string }) => r.id));
    await Promise.all(
      rows
        .filter((r) => !insertedIds.has(r.id))
        .map((r) =>
          db
            .from("opportunities")
            .update({ score: r.score, match_percent: r.match_percent, relevance: r.relevance, involved: r.involved, project_type: r.project_type, scale: r.scale, insight: r.insight })
            .eq("id", r.id)
        )
    );

    // Triggers for what is new. A story about a project already saved is a trigger on that saved lead.
    const fresh = picked.filter((l) => insertedIds.has(l.id));
    for (const lead of fresh) events.push(newLeadEvent(lead));
    if (admin && fresh.some((l) => l.origin === "News" || l.origin === "Regulatory")) {
      const known = opts.known ?? (await loadKnown(db));
      const freshOpps = fresh.map((l) => toOpportunity(l, assignee));
      const freshIds = new Set(freshOpps.map((o) => o.id));
      const lookup = relatedIndex([...known.filter((k) => !freshIds.has(k.id)), ...freshOpps]);
      for (const [i, lead] of fresh.entries()) {
        for (const match of lookup.project(freshOpps[i])) {
          if (!freshIds.has(match.lead.id) && isStrongStoryMatch(match)) events.push(newStoryEvent(match.lead.id, lead, match.reason));
        }
      }
      // Later scans in the same run see these leads without reading them again.
      opts.known?.push(...freshOpps.filter((o) => o.type === "News" || o.type === "Regulatory"));
    }
  }

  // Point each matched lead at the other register's listing. Best effort: only the person who found a lead can edit it.
  await Promise.all(
    links.map(({ saved, lead }) => {
      const patch = linkPatch(saved, lead);
      return patch ? (admin ?? db).from("opportunities").update(patch).eq("id", saved.id) : null;
    })
  );

  const triggers = await recordEvents(admin, events);

  return {
    kind: official ? "official" : "news",
    found: candidates.length,
    added,
    alreadySaved: official ? savedBefore : rows.length - added,
    duplicatesMerged: valid.length - unique.length,
    sameProjectLinked: links.length + sameProjectInRun,
    updated,
    triggers,
    lowRelevance,
    rejected,
    rejectionReasons,
  };
}
