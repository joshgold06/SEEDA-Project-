import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { EmailAiError, writeEmail } from "@/lib/ai/email";
import { contractorsOf } from "@/lib/leads/people";
import { formatMoney } from "@/lib/leads/extract";
import { rowToContact, type ContactRow } from "@/lib/contacts";
import { OWNER_NOT_NAMED, type OpportunityRow } from "@/lib/supabase/mappers";
import { rowToResearch, type ResearchDbRow } from "@/lib/research/types";

export const dynamic = "force-dynamic";
// The AI usually answers in 10 to 25 seconds.
export const maxDuration = 60;

const Body = z.object({
  opportunityId: z.string().min(3).max(80),
  angle: z.enum(["specialist", "schedule", "field", "heavy"]),
  tone: z.enum(["Direct", "Warm", "Technical"]),
  recipientContactId: z.string().uuid().optional(),
  instruction: z.string().max(300).optional(),
  currentBody: z.string().max(3000).optional(),
  senderName: z.string().min(1).max(80),
});

// Keeps one person from using up the free AI plan for everyone, since anyone can sign up.
const DAILY_LIMIT = 20;

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return Response.json({ error: "The server is missing its Supabase settings." }, { status: 500 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "AI drafts aren't switched on yet: the server has no GEMINI_API_KEY. Add it in the hosting settings and redeploy.", code: "not_configured" }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Sign in to write with AI." }, { status: 401 });
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) return Response.json({ error: "Your session expired. Sign in again." }, { status: 401 });
  const userId = userData.user.id;

  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "That request wasn't understood." }, { status: 400 });
  const input = body.data;

  const { data: leadRow } = await supabase.from("opportunities").select("*, organizations(name)").eq("id", input.opportunityId).maybeSingle();
  if (!leadRow) return Response.json({ error: "That lead couldn't be found." }, { status: 404 });
  const lead = leadRow as unknown as OpportunityRow;

  // Count first, so a spike can't run past the cap.
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count, error: countError } = await supabase.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  if (countError) {
    console.error("EPCMst: ai_usage unavailable.", countError.message);
    return Response.json({ error: "AI drafts aren't ready: the usage table hasn't been created yet.", code: "not_configured" }, { status: 503 });
  }
  if ((count ?? 0) >= DAILY_LIMIT) return Response.json({ error: `You've used ${DAILY_LIMIT} AI drafts in the last day. Try again tomorrow.`, code: "limit" }, { status: 429 });
  await supabase.from("ai_usage").insert({ user_id: userId, kind: "email" });

  // What the person has confirmed about this lead, and who the email is for.
  const { data: researchRow } = await supabase.from("lead_research").select("opportunity_id, findings, accepted, dismissed, researched_at").eq("opportunity_id", lead.id).maybeSingle();
  const research = researchRow ? rowToResearch(researchRow as ResearchDbRow) : null;

  let recipient: { name: string; role?: string; company?: string; evidence?: string } | undefined;
  if (input.recipientContactId) {
    const { data: contactRow } = await supabase.from("lead_contacts").select("*").eq("id", input.recipientContactId).eq("opportunity_id", lead.id).maybeSingle();
    if (contactRow) {
      const c = rowToContact(contactRow as ContactRow);
      const proof = research?.doc.findings.find((f) => f.kind === "person" && f.name.toLowerCase() === c.name.toLowerCase());
      recipient = { name: c.name, role: c.role, company: c.company, evidence: proof?.evidence };
    }
  }

  const org = Array.isArray(lead.organizations) ? lead.organizations[0] : lead.organizations;
  const headlineOwner = org?.name && org.name !== OWNER_NOT_NAMED ? org.name : undefined;
  const headlineContractors = contractorsOf({ involved: lead.involved ?? undefined } as Parameters<typeof contractorsOf>[0]);
  const confirmedContractors = (research?.accepted.contractors ?? []).map((c) => c.name).filter((n) => !headlineContractors.some((h) => h.toLowerCase() === n.toLowerCase()));

  try {
    const result = await writeEmail(
      {
        senderName: input.senderName.replace(/[\r\n]+/g, " ").trim(),
        senderCompany: "SEEDA (EPCMst network)",
        lead: {
          headline: lead.full_title ?? lead.title,
          location: lead.location,
          value: lead.value ? formatMoney(lead.value) : undefined,
          owner: headlineOwner,
          serviceLine: lead.service_line ?? undefined,
        },
        confirmed: { owner: research?.accepted.owner?.name, contractors: [...headlineContractors, ...confirmedContractors] },
        recipient,
        angle: input.angle,
        tone: input.tone,
        instruction: input.instruction?.trim() || undefined,
        currentBody: input.currentBody?.trim() || undefined,
      },
      { apiKey, model: process.env.GEMINI_MODEL || undefined }
    );
    return Response.json(result);
  } catch (err) {
    if (err instanceof EmailAiError) return Response.json({ error: err.message, code: err.code }, { status: err.status });
    console.error("EPCMst: email draft failed.", err instanceof Error ? err.message : err);
    return Response.json({ error: "The AI hit an unexpected problem. Try again." }, { status: 500 });
  }
}
