import { authoriseCron } from "@/lib/cronAuth";
import { ingest, IngestError, loadKnown, type IngestResult } from "@/lib/leads/ingest";
import { SEARCH_PRESETS } from "@/lib/leads/presets";
import type { Opportunity } from "@/lib/data";

// The daily scan. Vercel calls this once a day (see vercel.json) and sends the CRON_SECRET as a bearer token. It does what
// a person pressing "Find new signals" on every search does and records what changed as triggers, so the brief is ready
// before anyone opens the app. The AI summaries are a separate run (/api/cron/insights). Safe to run twice: leads and
// triggers are stored once per thing, so a repeat adds nothing.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOB = "daily-scan";
const CONCURRENCY = 4;

export async function GET(request: Request) {
  const auth = authoriseCron(request);
  if ("response" in auth) return auth.response;
  const { admin } = auth;

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

  const failed = results.filter((r) => !r.ok).length;
  const summary = { ...totals, searches: results.length, failedSearches: failed, results, seconds: Math.round((Date.now() - startedAt) / 1000) };
  // ok means the run did its job: at least one search worked.
  const ok = failed < results.length;
  if (run?.id) await admin.from("job_runs").update({ finished_at: new Date().toISOString(), ok, summary }).eq("id", run.id);

  return Response.json({ ok, ...summary }, { status: ok ? 200 : 502 });
}
