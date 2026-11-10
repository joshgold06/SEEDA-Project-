import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ExplainError, explainRecord } from "@/lib/ai/explain";
import { formatMoney } from "@/lib/leads/extract";
import { DAILY_LIMITS } from "@/lib/limits";
import { OWNER_NOT_NAMED, type OpportunityRow } from "@/lib/supabase/mappers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ opportunityId: z.string().min(3).max(80) });

// Keeps one person from using up the free AI plan for everyone, since anyone can sign up. Counted apart from email drafts.
const DAILY_LIMIT = DAILY_LIMITS.explain;

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return Response.json({ error: "The server is missing its Supabase settings." }, { status: 500 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "AI summaries aren't switched on yet: the server has no GEMINI_API_KEY. Add it in the hosting settings and redeploy.", code: "not_configured" }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sign in to use the AI summary." }, { status: 401 });
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return Response.json({ error: "Your session expired. Sign in again." }, { status: 401 });
  const userId = userData.user.id;

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request wasn't understood." }, { status: 400 });

  const { data: leadRow } = await supabase.from("opportunities").select("*, organizations(name)").eq("id", body.data.opportunityId).maybeSingle();
  if (!leadRow) return Response.json({ error: "That lead couldn't be found." }, { status: 404 });
  const lead = leadRow as unknown as OpportunityRow;

  // Count first, so a spike can't run past the cap.
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count, error: countError } = await supabase.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", "explain").gte("created_at", since);
  if (countError) {
    console.error("EPCMst: ai_usage unavailable.", countError.message);
    return Response.json({ error: "AI summaries aren't ready: the usage table hasn't been created yet.", code: "not_configured" }, { status: 503 });
  }
  if ((count ?? 0) >= DAILY_LIMIT) return Response.json({ error: `You've used ${DAILY_LIMIT} AI summaries in the last day. Try again tomorrow.`, code: "limit" }, { status: 429 });
  await supabase.from("ai_usage").insert({ user_id: userId, kind: "explain" });

  const org = Array.isArray(lead.organizations) ? lead.organizations[0] : lead.organizations;
  const owner = org?.name && org.name !== OWNER_NOT_NAMED ? org.name : lead.involved?.primary && lead.involved.primary !== OWNER_NOT_NAMED ? lead.involved.primary : undefined;

  try {
    const result = await explainRecord(
      {
        title: lead.full_title ?? lead.title,
        kind: lead.type,
        location: lead.location,
        owner,
        // The saved overview holds the record's own description; a news lead has only its headline.
        text: [lead.overview, lead.value ? `Stated value: ${formatMoney(Number(lead.value))}` : null, lead.deadline_text].filter(Boolean).join(" "),
      },
      { apiKey, model: process.env.GEMINI_MODEL || undefined }
    );
    return Response.json(result);
  } catch (err) {
    if (err instanceof ExplainError) return Response.json({ error: err.message, code: err.code }, { status: err.status });
    console.error("EPCMst: explain failed.", err instanceof Error ? err.message : err);
    return Response.json({ error: "The AI hit an unexpected problem. Try again." }, { status: 500 });
  }
}
