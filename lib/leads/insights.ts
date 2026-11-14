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

  const CONCURRENCY = 3;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    if (Date.now() - startedAt > opts.budgetMs) {
      result.stoppedBecause = "time";
      break;
    }
    const batch = todo.slice(i, i + CONCURRENCY);
    const outcomes = await Promise.all(
      batch.map(async (lead) => {
        try {
          const summary = await explainSavedLead(lead, { apiKey: opts.apiKey, model: opts.model });
          return (await storeInsight(admin, lead.id, summary)) ? ("ok" as const) : ("failed" as const);
        } catch (err) {
          const code = (err as { code?: string }).code;
          return code === "busy" ? ("busy" as const) : ("failed" as const);
        }
      })
    );
    for (const o of outcomes) {
      if (o === "ok") result.prepared++;
      else result.failed++;
    }
    if (outcomes.includes("busy")) {
      result.stoppedBecause = "busy";
      break;
    }
  }
  return result;
}
