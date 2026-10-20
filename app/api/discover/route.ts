import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { buildCandidate, dedupeLeads, toOpportunity } from "@/lib/leads/extract";
import { fetchGoogleNews } from "@/lib/leads/googleNews";
import { resolveQuery } from "@/lib/leads/presets";
import { LeadSchema, MIN_SCORE, type Lead } from "@/lib/leads/schema";
import { opportunityToRow } from "@/lib/supabase/mappers";

export const dynamic = "force-dynamic";

const Body = z.object({
  presetId: z.string().max(40).optional(),
  query: z.string().max(200).optional(),
  assignee: z.string().max(3).optional(),
});

const MAX_NEW_LEADS = 12;

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
  const query = resolveQuery(body.data.presetId, body.data.query);
  if (!query) return Response.json({ error: "Choose a search or type one." }, { status: 400 });

  let items;
  try {
    items = await fetchGoogleNews(query);
  } catch {
    return Response.json({ error: "Couldn't reach the news feed. Try again in a minute." }, { status: 502 });
  }

  const valid: Lead[] = [];
  let rejected = 0;
  let lowRelevance = 0;
  const rejectionReasons: Record<string, number> = {};
  for (const item of items) {
    const result = LeadSchema.safeParse(buildCandidate(item));
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

  const unique = dedupeLeads(valid);
  const rows = unique
    .slice(0, MAX_NEW_LEADS)
    .map((lead) => opportunityToRow(toOpportunity(lead, body.data.assignee?.trim() || "U")));

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

  return Response.json({
    found: items.length,
    added,
    alreadySaved: rows.length - added,
    duplicatesMerged: valid.length - unique.length,
    lowRelevance,
    rejected,
    rejectionReasons,
  });
}
