import type { SupabaseClient } from "@supabase/supabase-js";
import type { Explained } from "../ai/explain";
import { explainSavedLead } from "../ai/explainLead";
import { LEAD_SELECT, type OpportunityRow } from "../supabase/mappers";

// Summaries prepared ahead of time, so the AI's reading of a lead is waiting when someone opens it instead of being
// made on demand. Written with the service client only; every signed-in person can read them.

export interface Prepared {
  summary: Explained;
  generatedAt: string;
}

/** Saves a summary for a lead. Returns false when it could not be stored (the table may not exist yet). */
export async function storeInsight(admin: SupabaseClient, opportunityId: string, summary: Explained): Promise<boolean> {
  const { error } = await admin.from("lead_insights").upsert({ opportunity_id: opportunityId, summary, generated_at: new Date().toISOString() }, { onConflict: "opportunity_id" });
  if (error) console.warn("EPCMst: could not store an AI summary.", error.message);
  return !error;
}

export interface PrepareResult {
  prepared: number;
  failed: number;
  /** Why it stopped early, if it did. */
  stoppedBecause?: "time" | "busy" | "limit";
}

/**
 * Writes summaries for the best leads that don't have one yet, a few at a time, until the time budget is used.
 * The free AI plan is small, so it prepares a handful each day, best score first, and stops at the first "busy" answer.
 */
export async function prepareInsights(admin: SupabaseClient, opts: { apiKey: string; model?: string; limit: number; budgetMs: number }): Promise<PrepareResult> {
  const startedAt = Date.now();
  const result: PrepareResult = { prepared: 0, failed: 0 };

  const { data: have } = await admin.from("lead_insights").select("opportunity_id");
  const done = new Set((have ?? []).map((r: { opportunity_id: string }) => r.opportunity_id));
  const { data: rows } = await admin
    .from("opportunities")
    .select(LEAD_SELECT)
    .eq("in_scan", true)
    .in("type", ["News", "Regulatory", "Permit", "Tender"])
    .order("score", { ascending: false })
    .limit(60);
  const todo = ((rows ?? []) as unknown as OpportunityRow[]).filter((r) => !done.has(r.id)).slice(0, opts.limit);

  // One at a time with a short pause: the free AI plan allows only a few requests a minute, and three at once were
  // answered "busy". A busy answer is retried once after a wait; the run only gives up after two leads in a row stay busy.
  const PAUSE_MS = 2_500;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const attempt = async (lead: OpportunityRow): Promise<"ok" | "busy" | "failed"> => {
    try {
      const summary = await explainSavedLead(lead, { apiKey: opts.apiKey, model: opts.model });
      return (await storeInsight(admin, lead.id, summary)) ? "ok" : "failed";
    } catch (err) {
      return (err as { code?: string }).code === "busy" ? "busy" : "failed";
    }
  };

  let busyInARow = 0;
  for (const lead of todo) {
    if (Date.now() - startedAt > opts.budgetMs) {
      result.stoppedBecause = "time";
      break;
    }
    let outcome = await attempt(lead);
    if (outcome === "busy" && Date.now() - startedAt + 6_000 < opts.budgetMs) {
      await sleep(5_000);
      outcome = await attempt(lead);
    }
    if (outcome === "ok") {
      result.prepared++;
      busyInARow = 0;
    } else {
      result.failed++;
      busyInARow = outcome === "busy" ? busyInARow + 1 : 0;
      if (busyInARow >= 2) {
        result.stoppedBecause = "busy";
        break;
      }
    }
    await sleep(PAUSE_MS);
  }
  return result;
}
