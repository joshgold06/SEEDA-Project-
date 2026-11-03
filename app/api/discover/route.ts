import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { buildCandidate, dedupeLeads, toOpportunity } from "@/lib/leads/extract";
import { fetchGoogleNews } from "@/lib/leads/googleNews";
import { buildOfficialCandidate } from "@/lib/leads/official/build";
import { fetchOfficial, OFFICIAL_SOURCES } from "@/lib/leads/official";
import { linkPatch, savedListing, splitSameProject, type SplitResult } from "@/lib/leads/official/link";
import { ensureOrganizations } from "@/lib/leads/organizations";
import { findPreset, resolveQuery } from "@/lib/leads/presets";
import { LeadSchema, MIN_SCORE, type Lead } from "@/lib/leads/schema";
import { opportunityToRow } from "@/lib/supabase/mappers";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({
  presetId: z.string().max(40).optional(),
  query: z.string().max(200).optional(),
  assignee: z.string().max(3).optional(),
});

const MAX_NEW_LEADS = 12;
// A register holds many more relevant records than a news query returns, so one run may add more.
const MAX_NEW_OFFICIAL = 25;

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return Response.json({ error: "The server is missing its Supabase settings." }, { status: 500 });

  // Only signed-in users may trigger searches, so the endpoint can't be used anonymously.
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sign in to run a search." }, { status: 401 });

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return Response.json({ error: "Your session expired. Sign in again." }, { status: 401 });

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That search request wasn't understood." }, { status: 400 });
  const official = findPreset(body.data.presetId)?.official;
  const query = official ? null : resolveQuery(body.data.presetId, body.data.query);
  if (!official && !query) return Response.json({ error: "Choose a search or type one." }, { status: 400 });

  // Both routes end in the same list of candidates, so validation, scoring and saving are shared.
  let candidates: Record<string, unknown>[];
  try {
    candidates = official
      ? (await fetchOfficial(official)).map((record) => buildOfficialCandidate(record))
      : (await fetchGoogleNews(query!)).map((item) => buildCandidate(item));
  } catch (err) {
    console.error("EPCMst: discover source failed", official ?? "news", err instanceof Error ? err.message : err);
    return Response.json(
      { error: official ? `Couldn't reach the ${OFFICIAL_SOURCES[official].label} data. Try again in a minute.` : "Couldn't reach the news feed. Try again in a minute." },
      { status: 502 }
    );
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
    } else if (result.data.score < MIN_SCORE) {
      lowRelevance++;
    } else {
      valid.push(result.data);
    }
  }

  // Headlines repeat across outlets, so they are merged. Official records are unique by id; the best ones
  // not saved yet are taken, so each run reaches further down the register instead of repeating the top.
  let unique: Lead[];
  let picked: Lead[];
  let savedBefore = 0;
  let links: SplitResult["links"] = [];
  let sameProjectInRun = 0;
  if (official) {
    unique = [...valid].sort((a, b) => b.score - a.score);
    // Checked in chunks so the request URL stays short.
    const ids = unique.map((l) => l.id);
    const chunks = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100));
    const checks = await Promise.all(chunks.map((chunk) => supabase.from("opportunities").select("id").in("id", chunk)));
    const have = new Set(checks.flatMap((r) => (r.data ?? []).map((row: { id: string }) => row.id)));
    savedBefore = have.size;
    // The same project can be on two registers (a mine under both the federal and the BC assessment): the second
    // listing is attached to the saved lead instead of becoming a second lead.
    const { data: savedRows } = await supabase.from("opportunities").select("id, title, full_title, location, overview, documents, involved").eq("type", "Regulatory");
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
  const orgIds = await ensureOrganizations(supabase, [...companies].map(([name, owner_type]) => ({ name, owner_type })));

  const rows = picked.map((lead) =>
    opportunityToRow(toOpportunity(lead, body.data.assignee?.trim() || "U"), {
      discoveredBy: userData.user.id,
      organizationId: orgIds.get(lead.organization) ?? null,
    })
  );

  let added = 0;
  if (rows.length) {
    const { data, error } = await supabase
      .from("opportunities")
      .upsert(rows, { onConflict: "id", ignoreDuplicates: true })
      .select("id");
    if (error) return Response.json({ error: `Couldn't save the leads: ${error.message}` }, { status: 500 });
    added = data?.length ?? 0;

    // Leads saved earlier keep the user's own choices (stage, watch, dismiss) but get
    // their scoring refreshed, so the score breakdown stays current as rules improve.
    const insertedIds = new Set((data ?? []).map((r: { id: string }) => r.id));
    await Promise.all(
      rows
        .filter((r) => !insertedIds.has(r.id))
        .map((r) =>
          supabase
            .from("opportunities")
            .update({ score: r.score, match_percent: r.match_percent, relevance: r.relevance, involved: r.involved, project_type: r.project_type, scale: r.scale, insight: r.insight })
            .eq("id", r.id)
        )
    );
  }

  // Point each matched lead at the other register's listing. Best effort: only the person who found a lead can edit it.
  await Promise.all(
    links.map(({ saved, lead }) => {
      const patch = linkPatch(saved, lead);
      return patch ? supabase.from("opportunities").update(patch).eq("id", saved.id) : null;
    })
  );

  return Response.json({
    kind: official ? "official" : "news",
    found: candidates.length,
    added,
    alreadySaved: official ? savedBefore : rows.length - added,
    duplicatesMerged: valid.length - unique.length,
    sameProjectLinked: links.length + sameProjectInRun,
    lowRelevance,
    rejected,
    rejectionReasons,
  });
}
