import { authoriseCron } from "@/lib/cronAuth";
import { runAgent } from "@/lib/agent/prep";
import { DEFAULT_GEMINI_MODEL } from "@/lib/ai/gemini";

// The scheduled prep agent (see vercel.json; it is scheduled a few times a day because one research takes most of the
// 60 seconds a run is allowed). Each run prepares at most a lead or two: it checks for duplicates, reads the web and drafts
// an email, then waits for a person. Safe to run twice: a lead already handled is never done again.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOB = "daily-agent";

export async function GET(request: Request) {
  const auth = authoriseCron(request);
  if ("response" in auth) return auth.response;
  const { admin } = auth;

  const tavily = process.env.TAVILY_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  if (!tavily || !gemini) return Response.json({ error: "TAVILY_API_KEY and GEMINI_API_KEY must both be set on the server." }, { status: 503 });

  const { data: run } = await admin.from("job_runs").insert({ job: JOB }).select("id").single();
  const result = await runAgent(admin, { tavily, gemini, model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL }, { maxLeads: 2, startBeforeMs: 12_000 });
  const summary = { outcomes: result.outcomes, completedDraft: result.completedDraft, seconds: result.seconds };
  if (run?.id) await admin.from("job_runs").update({ finished_at: new Date().toISOString(), ok: true, summary }).eq("id", run.id);
  return Response.json({ ok: true, ...summary });
}
