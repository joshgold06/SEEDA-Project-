import { timingSafeEqual } from "node:crypto";
import { ingest, IngestError, loadKnown, type IngestResult } from "@/lib/leads/ingest";
import { prepareInsights } from "@/lib/leads/insights";
import { SEARCH_PRESETS } from "@/lib/leads/presets";
import { createServiceClient } from "@/lib/supabase/service";
import type { Opportunity } from "@/lib/data";

// The daily run. Vercel calls this once a day (see vercel.json) and sends the CRON_SECRET as a bearer token. It does what
// a person pressing "Find new signals" on every search does, then records what changed as triggers and has the AI read the
// best new leads, so the brief is ready before anyone opens the app. Safe to run twice: leads, triggers and summaries are
// all stored once per thing, so a repeat adds nothing.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOB = "daily-scan";
const CONCURRENCY = 4;
const INSIGHT_LIMIT = 8;
// The AI summaries only start while there is time left in the 60 second limit.
const INSIGHT_START_BEFORE_MS = 38_000;

function authorised(request: Request, secret: string): boolean {
  const given = Buffer.from((request.headers.get("authorization") ?? "").trim());
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export async function GET(request: Request) {
  // A stray space, line break or pair of quote marks pasted into the hosting settings is easy to miss, so they are ignored.
  const secret = process.env.CRON_SECRET?.trim().replace(/^(["'])(.*)\1$/, "$2").trim();
  if (!secret || secret.length < 16) {
    return Response.json({ error: "CRON_SECRET is not set (or is shorter than 16 characters)." }, { status: 503 });
  }
  if (!authorised(request, secret)) return Response.json({ error: "Not allowed." }, { status: 401 });

  const admin = createServiceClient();
  if (!admin) return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set on the server." }, { status: 503 });

  const startedAt = Date.now();
  const { data: run } = await admin.from("job_runs").insert({ job: JOB }).select("id").single();

  // Read once and shared by every scan in this run (each scan adds the leads it saves).
  const known: Opportunity[] = await loadKnown(admin);
  const results: { search: string; ok: boolean; added?: number; updated?: number; triggers?: number; error?: string }[] = [];
  const totals: Pick<IngestResult, "added" | "updated" | "triggers"> = { added: 0, updated: 0, triggers: 0 };

  // One failing source never stops the others.
  let next = 0;
  const worker = async () => {
    while (next < SEARCH_PRESETS.length) {
      const preset = SEARCH_PRESETS[next++];
      try {
        const result = await ingest(preset.official ? { official: preset.official } : { query: preset.query }, { db: admin, admin, discoveredBy: null, assignee: "AI", known });
        totals.added += result.added;
        totals.updated += result.updated;
        totals.triggers += result.triggers;
        results.push({ search: preset.label, ok: true, added: result.added, updated: result.updated, triggers: result.triggers });
      } catch (err) {
        const message = err instanceof IngestError || err instanceof Error ? err.message : "Failed";
        console.error("EPCMst: daily scan failed for", preset.label, message);
        results.push({ search: preset.label, ok: false, error: message.slice(0, 200) });
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // AI summaries for the best leads that don't have one yet. Skipped, not failed, when there is no key or no time.
  let insights: { prepared: number; failed: number; stoppedBecause?: string } | { skipped: string } = { skipped: "GEMINI_API_KEY is not set" };
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    const left = INSIGHT_START_BEFORE_MS - (Date.now() - startedAt);
    insights = left > 0 ? await prepareInsights(admin, { apiKey, model: process.env.GEMINI_MODEL || undefined, limit: INSIGHT_LIMIT, budgetMs: left }) : { skipped: "the scans used the time" };
  }

  const failed = results.filter((r) => !r.ok).length;
  const summary = { ...totals, searches: results.length, failedSearches: failed, results, insights, seconds: Math.round((Date.now() - startedAt) / 1000) };
  // ok means the run did its job: at least one search worked.
  const ok = failed < results.length;
  if (run?.id) await admin.from("job_runs").update({ finished_at: new Date().toISOString(), ok, summary }).eq("id", run.id);

  return Response.json({ ok, ...summary }, { status: ok ? 200 : 502 });
}
