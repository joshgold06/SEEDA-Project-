import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { contractorsOf } from "@/lib/leads/people";
import { OWNER_NOT_NAMED, type OpportunityRow } from "@/lib/supabase/mappers";
import { researchLead, ResearchError } from "@/lib/research/run";
import { NO_ACCEPTED } from "@/lib/research/types";

export const dynamic = "force-dynamic";
// Searching and reading can take 20 to 40 seconds.
export const maxDuration = 60;

const Body = z.object({ opportunityId: z.string().min(3).max(80) });

// Keeps one person from using up the free search and AI plans for everyone.
const DAILY_LIMIT = 25;
const DEFAULT_MODEL = "gemini-3.6-flash";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return Response.json({ error: "The server is missing its Supabase settings." }, { status: 500 });

  const tavily = process.env.TAVILY_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  if (!tavily || !gemini) {
    // Only the variable names are reported, never their values.
    const missing = [!tavily ? "TAVILY_API_KEY" : null, !gemini ? "GEMINI_API_KEY" : null].filter(Boolean).join(" and ");
    return Response.json({ error: `Research isn't switched on yet: the server has no ${missing}. Add it in the hosting settings and redeploy.`, code: "not_configured" }, { status: 503 });
  }

  // Only signed-in people can start research, and what they can read is limited by their own access.
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sign in to research a lead." }, { status: 401 });
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return Response.json({ error: "Your session expired. Sign in again." }, { status: 401 });
  const userId = userData.user.id;

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That research request wasn't understood." }, { status: 400 });

  const { data: leadRow, error: leadError } = await supabase.from("opportunities").select("*, organizations(name)").eq("id", body.data.opportunityId).maybeSingle();
  if (leadError || !leadRow) return Response.json({ error: "That lead couldn't be found." }, { status: 404 });
  const lead = leadRow as unknown as OpportunityRow;

  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await supabase.from("lead_research").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("researched_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) {
    return Response.json({ error: `You've run ${DAILY_LIMIT} researches in the last day. Try again tomorrow.`, code: "limit" }, { status: 429 });
  }

  const org = Array.isArray(lead.organizations) ? lead.organizations[0] : lead.organizations;
  const owner = org?.name && org.name !== OWNER_NOT_NAMED ? org.name : null;
  const forLead = {
    title: lead.full_title ?? lead.title,
    publisher: lead.source_id ?? undefined,
    location: lead.location,
    owner,
    contractors: contractorsOf({ involved: lead.involved ?? undefined } as Parameters<typeof contractorsOf>[0]),
  };

  let doc;
  try {
    doc = await researchLead(forLead, { tavily, gemini, model: process.env.GEMINI_MODEL || DEFAULT_MODEL });
  } catch (err) {
    if (err instanceof ResearchError) return Response.json({ error: err.message, code: err.code }, { status: err.status });
    console.error("EPCMst: research failed.", err instanceof Error ? err.message : err);
    return Response.json({ error: "The research hit an unexpected problem. Try again." }, { status: 500 });
  }

  // A re-run replaces the findings but keeps what the person already accepted and dismissed.
  const { data: existing } = await supabase.from("lead_research").select("accepted, dismissed").eq("user_id", userId).eq("opportunity_id", lead.id).maybeSingle();
  const now = new Date().toISOString();
  const { data: saved, error: saveError } = await supabase
    .from("lead_research")
    .upsert(
      {
        user_id: userId,
        opportunity_id: lead.id,
        findings: doc,
        accepted: existing?.accepted ?? NO_ACCEPTED,
        dismissed: existing?.dismissed ?? [],
        researched_at: now,
      },
      { onConflict: "user_id,opportunity_id" }
    )
    .select("opportunity_id, findings, accepted, dismissed, researched_at")
    .single();
  if (saveError || !saved) {
    console.error("EPCMst: couldn't save research.", saveError?.message);
    return Response.json({ error: "The research finished but couldn't be saved. Try again." }, { status: 500 });
  }
  return Response.json({ row: saved });
}
