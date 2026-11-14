import { authoriseCron } from "@/lib/cronAuth";
import { prepareInsights } from "@/lib/leads/insights";

// Runs shortly after the daily scan (see vercel.json) and has the AI read the best leads that have no summary yet.
// It is a separate run so it gets its own 60 seconds instead of what the scans leave over. Safe to run twice: a lead that
// already has a summary is skipped.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOB = "daily-insights";
const LIMIT = 10;
// A summary can take several seconds, so none is started once this much of the 60 seconds has passed.
const START_BEFORE_MS = 45_000;

export async function GET(request: Request) {
  const auth = authoriseCron(request);
  if ("response" in auth) return auth.response;
  const { admin } = auth;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ error: "GEMINI_API_KEY is not set on the server." }, { status: 503 });

  const startedAt = Date.now();
  const { data: run } = await admin.from("job_runs").insert({ job: JOB }).select("id").single();
  const result = await prepareInsights(admin, { apiKey, model: process.env.GEMINI_MODEL || undefined, limit: LIMIT, budgetMs: START_BEFORE_MS });
  const summary = { ...result, seconds: Math.round((Date.now() - startedAt) / 1000) };
  if (run?.id) await admin.from("job_runs").update({ finished_at: new Date().toISOString(), ok: true, summary }).eq("id", run.id);
  return Response.json({ ok: true, ...summary });
}
