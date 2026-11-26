import type { SupabaseClient } from "@supabase/supabase-js";
import { EmailAiError, writeEmail } from "../ai/email";
import type { Opportunity } from "../data";
import { formatMoney } from "../leads/extract";
import { loadKnown } from "../leads/ingest";
import { contractorsOf } from "../leads/people";
import { relatedIndex } from "../related";
import { ResearchError, researchLead, type ResearchLead } from "../research/run";
import { FindingsDocSchema, type Finding, type FindingsDoc } from "../research/types";
import { OWNER_NOT_NAMED } from "../supabase/mappers";
import { DAILY_CAP, draftProblems, hasSomethingToAct, isCandidate, isSetAside, judgeTwins, MAX_CHECKED, pickRecipient, SENDER_TOKEN, SET_ASIDE_HOURS, SET_ASIDE_STEP, shouldClearWorking } from "./judge";
import type { PrepDraft, PrepStep } from "./types";

// SERVER ONLY. The prep agent. For one good lead it does the first steps of the job a business-development person would
// do by hand: check the project is not already being worked under another headline, read the web about it, and draft an
// outreach email. It writes the result and a plain list of what it did to lead_prep, and stops. It never sends anything.

export interface AgentKeys {
  tavily: string;
  gemini: string;
  model: string;
}

export interface AgentContext {
  admin: SupabaseClient;
  known: Opportunity[];
  lookup: ReturnType<typeof relatedIndex>;
  /** Leads the agent has already handled in any way, or that a person has already researched. */
  handled: Set<string>;
  /** Leads that have been prepared (or are being prepared). */
  prepared: Set<string>;
  /** Leads that anyone has moved to Outreach or Pipeline. */
  underway: Set<string>;
  /** When this run began, so every step can see how much of the serverless time limit is left. */
  startedAt: number;
}

export type AgentOutcome =
  | { kind: "prepared"; opportunityId: string; title: string; draft: boolean }
  | { kind: "skipped"; opportunityId: string; title: string; reason: string }
  | { kind: "nothing_to_do"; reason: "daily_cap" | "no_candidates" }
  | { kind: "retry_later"; opportunityId: string; title: string; error: string };

// A run may last 60 seconds. Stopping a little before leaves room to save, and a run that is cut off leaves its lead
// "working" until it is cleared, which wastes the searches already spent on it.
const RUN_LIMIT_MS = 52_000;
/** The shortest time worth starting an email draft in; below it the draft is left for a later run. */
const MIN_DRAFT_MS = 9_000;
const BUSY_WAIT_MS = 4_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const timeLeft = (ctx: AgentContext) => RUN_LIMIT_MS - (Date.now() - ctx.startedAt);

const step = (name: string, ok: boolean, note: string): PrepStep => ({ step: name, ok, note });
const DRAFT_STEP = "Drafted the email";

/** Reads everything the agent needs to decide, once per run. */
export async function createAgentContext(admin: SupabaseClient): Promise<AgentContext> {
  const startedAt = Date.now();
  // A run that died half way leaves a "working" row, and so does a lead set aside after its research failed. Each is
  // cleared when its wait is over, so the lead can be tried again.
  const working = await admin.from("lead_prep").select("opportunity_id, created_at, steps").eq("status", "working");
  const expired = ((working.data ?? []) as { opportunity_id: string; created_at: string; steps: unknown }[]).filter((r) => shouldClearWorking(r, Date.now())).map((r) => r.opportunity_id);
  if (expired.length) await admin.from("lead_prep").delete().eq("status", "working").in("opportunity_id", expired);

  const [known, prep, researched, actions] = await Promise.all([
    loadKnown(admin),
    admin.from("lead_prep").select("opportunity_id, status, steps"),
    admin.from("lead_research").select("opportunity_id"),
    admin.from("lead_actions").select("opportunity_id").in("stage", ["outreach", "pipeline"]),
  ]);
  const prepRows = (prep.data ?? []) as { opportunity_id: string; status: string; steps: unknown }[];
  const handled = new Set<string>([...prepRows.map((r) => r.opportunity_id), ...((researched.data ?? []) as { opportunity_id: string }[]).map((r) => r.opportunity_id)]);
  // A set-aside lead was never prepared, so it must not stop a twin story about the same project from being prepared.
  const prepared = new Set(prepRows.filter((r) => r.status === "ready" || (r.status === "working" && !isSetAside(r.steps))).map((r) => r.opportunity_id));
  const underway = new Set(((actions.data ?? []) as { opportunity_id: string }[]).map((r) => r.opportunity_id));
  return { admin, known, lookup: relatedIndex(known), handled, prepared, underway, startedAt };
}

/** How many leads were fully prepared in the last 24 hours. */
export async function preparedToday(admin: SupabaseClient): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await admin.from("lead_prep").select("opportunity_id", { count: "exact", head: true }).eq("status", "ready").gte("created_at", since);
  return count ?? 0;
}

async function record(ctx: AgentContext, id: string, status: "skipped_duplicate" | "skipped_nothing_found", steps: PrepStep[]) {
  ctx.handled.add(id);
  await ctx.admin.from("lead_prep").upsert({ opportunity_id: id, status, steps, finished_at: new Date().toISOString() }, { onConflict: "opportunity_id", ignoreDuplicates: true });
}

const toResearchLead = (o: Opportunity): ResearchLead => ({
  title: o.fullTitle ?? o.title,
  publisher: o.sourceId,
  location: o.location,
  owner: o.owner && o.owner !== OWNER_NOT_NAMED ? o.owner : null,
  contractors: contractorsOf(o),
});

const names = (findings: Finding[], kind: Finding["kind"]) => findings.filter((f) => f.kind === kind).map((f) => f.name);

/**
 * Writes the email for a lead from what the research found. A busy AI is retried once after a short wait, as long as the
 * run has time; with too little time left the draft is left for a later run instead of risking the whole run.
 */
async function draftEmail(ctx: AgentContext, keys: AgentKeys, lead: Opportunity, findings: Finding[]): Promise<{ draft: PrepDraft | null; step: PrepStep }> {
  const recipient = pickRecipient(findings);
  const recipientInfo = recipient ? { name: recipient.name, role: recipient.role, company: recipient.company, evidence: recipient.evidence } : undefined;
  const owners = names(findings, "owner");
  const contractors = names(findings, "contractor");

  for (let attempt = 0; attempt < 2; attempt++) {
    const left = timeLeft(ctx);
    if (left < MIN_DRAFT_MS) return { draft: null, step: step(DRAFT_STEP, false, "There was no time left in this run to write it. A later run will finish it.") };
    try {
      const out = await writeEmail(
        {
          senderName: SENDER_TOKEN,
          senderCompany: "SEEDA (EPCMst network)",
          lead: { headline: lead.fullTitle ?? lead.title, location: lead.location, value: lead.value ? formatMoney(lead.value) : undefined, owner: lead.owner !== OWNER_NOT_NAMED ? lead.owner : undefined, serviceLine: lead.serviceLine, kind: lead.type },
          confirmed: { owner: owners[0], contractors: [...new Set([...contractorsOf(lead), ...contractors])] },
          recipient: recipientInfo,
          angle: "specialist",
          tone: "Warm",
        },
        { apiKey: keys.gemini, model: keys.model, totalMs: left - 2_000 }
      );
      const problems = draftProblems(out.body);
      if (problems.length > 0) return { draft: null, step: step(DRAFT_STEP, false, `The draft was thrown away because ${problems.join(" and ")}. Use “Write with AI” in the Outreach Studio instead.`) };
      return {
        draft: { subjectA: out.subjectA, subjectB: out.subjectB, body: out.body, linkedinNote: out.linkedinNote, tone: "Warm", angle: "specialist", recipient: recipientInfo },
        step: step(DRAFT_STEP, true, "Short, plain, and signed with a placeholder for the sender’s name. It passed the checks (no placeholders, no exclamation marks, under 180 words)."),
      };
    } catch (err) {
      const busy = err instanceof EmailAiError && err.code === "busy";
      if (busy && attempt === 0 && timeLeft(ctx) > MIN_DRAFT_MS + BUSY_WAIT_MS) {
        await sleep(BUSY_WAIT_MS);
        continue;
      }
      return { draft: null, step: step(DRAFT_STEP, false, `The AI could not write the draft (${err instanceof Error ? err.message : "unknown error"}). A later run will try again, or use “Write with AI” in the Outreach Studio.`) };
    }
  }
  return { draft: null, step: step(DRAFT_STEP, false, "The AI could not write the draft. A later run will try again.") };
}

/**
 * Finishes the drafts that an earlier run could not write (the AI was busy, or the run was out of time). One per call, so
 * it fits in what is left of a run. Returns the title it completed, or null.
 */
export async function completeOneMissingDraft(ctx: AgentContext, keys: AgentKeys): Promise<string | null> {
  if (timeLeft(ctx) < MIN_DRAFT_MS + 3_000) return null;
  const { data } = await ctx.admin.from("lead_prep").select("opportunity_id, findings, steps").eq("status", "ready").is("draft", null).order("created_at", { ascending: false }).limit(10);
  for (const row of (data ?? []) as { opportunity_id: string; findings: unknown; steps: PrepStep[] | null }[]) {
    const doc = FindingsDocSchema.safeParse(row.findings);
    const lead = ctx.known.find((o) => o.id === row.opportunity_id);
    if (!doc.success || !lead || !hasSomethingToAct(doc.data.findings)) continue;
    const result = await draftEmail(ctx, keys, lead, doc.data.findings);
    if (!result.draft) {
      // Try the next lead only if this failed for a reason that is not the AI being down.
      continue;
    }
    const steps = [...(row.steps ?? []).filter((s) => s.step !== DRAFT_STEP), step(DRAFT_STEP, true, `${result.step.note} (Written in a later run, after the first attempt failed.)`)];
    await ctx.admin.from("lead_prep").update({ draft: result.draft, steps }).eq("opportunity_id", row.opportunity_id);
    return lead.title;
  }
  return null;
}

/** Runs the agent for up to `maxLeads` leads, starting another only while there is time left in the serverless limit. */
export async function runAgent(admin: SupabaseClient, keys: AgentKeys, opts: { maxLeads: number; startBeforeMs: number }): Promise<{ outcomes: AgentOutcome[]; completedDraft: string | null; seconds: number }> {
  const ctx = await createAgentContext(admin);
  const outcomes: AgentOutcome[] = [];
  for (let i = 0; i < opts.maxLeads; i++) {
    if (i > 0 && Date.now() - ctx.startedAt > opts.startBeforeMs) break;
    const outcome = await runAgentOnce(ctx, keys);
    outcomes.push(outcome);
    // Nothing left to do, or a service is struggling: stop instead of trying again straight away.
    if (outcome.kind === "nothing_to_do" || outcome.kind === "retry_later") break;
  }
  // With time to spare (a quiet day, the daily limit reached, or research that failed quickly), finish a draft an
  // earlier run could not write. It checks the time left itself.
  const completedDraft = await completeOneMissingDraft(ctx, keys);
  return { outcomes, completedDraft, seconds: Math.round((Date.now() - ctx.startedAt) / 1000) };
}

/**
 * Prepares the single best lead that is not a duplicate. Returns what happened. One call does at most one piece of
 * research, because that is what fits in one serverless run.
 */
export async function runAgentOnce(ctx: AgentContext, keys: AgentKeys): Promise<AgentOutcome> {
  if ((await preparedToday(ctx.admin)) >= DAILY_CAP) return { kind: "nothing_to_do", reason: "daily_cap" };

  const candidates = ctx.known.filter((o) => isCandidate(o) && !ctx.handled.has(o.id)).sort((a, b) => b.score - a.score).slice(0, MAX_CHECKED);

  for (const lead of candidates) {
    // Step 1: is this the same project as one that is already being worked?
    const twins = ctx.lookup.project(lead).map((r) => ({ id: r.lead.id, title: r.lead.fullTitle ?? r.lead.title }));
    const blocked = judgeTwins(twins, ctx.prepared, ctx.underway);
    if (blocked) {
      const why = blocked.why === "being_contacted" ? "is already being contacted" : "has already been prepared";
      await record(ctx, lead.id, "skipped_duplicate", [
        step("Picked the lead", true, `Score ${lead.score}.`),
        step("Checked for duplicates", false, `Looks like the same project as “${blocked.twin.title}”, which ${why}. Skipped, so the same company is not approached twice about one project.`),
      ]);
      continue;
    }
    const companyTwins = ctx.lookup.company(lead, new Set(twins.map((t) => t.id)));
    const steps: PrepStep[] = [
      step("Picked the lead", true, `Score ${lead.score}, the best one not yet handled.`),
      step("Checked for duplicates", true, companyTwins ? `No other lead about this project is being worked. ${companyTwins.total} other lead${companyTwins.total === 1 ? "" : "s"} name ${companyTwins.name}, so check before contacting them.` : "No other lead about this project is being worked."),
    ];

    // Claim it first, so two runs at once never do the same lead.
    const claim = await ctx.admin.from("lead_prep").upsert({ opportunity_id: lead.id, status: "working", steps }, { onConflict: "opportunity_id", ignoreDuplicates: true }).select("opportunity_id");
    if (!claim.data?.length) {
      ctx.handled.add(lead.id);
      continue;
    }
    ctx.handled.add(lead.id);
    ctx.prepared.add(lead.id);

    // Step 2: read the web.
    let doc: FindingsDoc;
    try {
      doc = await researchLead(toResearchLead(lead), { tavily: keys.tavily, gemini: keys.gemini, model: keys.model });
    } catch (err) {
      const message = err instanceof Error ? err.message : "The research failed.";
      console.error("EPCMst: prep agent research failed.", JSON.stringify({ lead: lead.id, error: message, kind: err instanceof Error ? err.constructor.name : typeof err }));
      ctx.prepared.delete(lead.id);
      if (err instanceof ResearchError && err.code === "not_configured") {
        // A rejected key fails every lead alike, so no lead is held back for it.
        await ctx.admin.from("lead_prep").delete().eq("opportunity_id", lead.id).eq("status", "working");
      } else {
        // Set this lead aside for a day, so the next run moves on instead of picking the same slow lead again.
        steps.push(step(SET_ASIDE_STEP, false, `The research could not finish: ${message} It will be tried again after ${SET_ASIDE_HOURS} hours.`));
        await ctx.admin.from("lead_prep").update({ steps, created_at: new Date().toISOString() }).eq("opportunity_id", lead.id).eq("status", "working");
      }
      return { kind: "retry_later", opportunityId: lead.id, title: lead.title, error: message };
    }
    const owners = names(doc.findings, "owner");
    const contractors = names(doc.findings, "contractor");
    const people = doc.findings.filter((f) => f.kind === "person");
    steps.push(step("Researched the web", doc.findings.length > 0, `${doc.sources.length} pages read. Found ${owners.length} owner${owners.length === 1 ? "" : "s"}, ${contractors.length} contractor${contractors.length === 1 ? "" : "s"} and ${people.length} named ${people.length === 1 ? "person" : "people"}, each with its quote.`));

    // Step 3: is there anything a person could act on? An owner alone is not enough to write to anyone.
    if (!hasSomethingToAct(doc.findings)) {
      steps.push(step("Stopped", false, doc.findings.length === 0 ? "The web research found nothing, so no email was drafted." : "Only the owner was found: no contractor and no named person to write to yet, so no email was drafted and the lead was not put forward."));
      await ctx.admin.from("lead_prep").update({ status: "skipped_nothing_found", findings: doc, steps, finished_at: new Date().toISOString() }).eq("opportunity_id", lead.id);
      ctx.prepared.delete(lead.id);
      return { kind: "skipped", opportunityId: lead.id, title: lead.title, reason: "nothing to act on" };
    }

    // Step 4: choose who to write to, then draft the email.
    const recipient = pickRecipient(doc.findings);
    steps.push(
      recipient
        ? step("Chose who to write to", true, `${recipient.name}${recipient.role ? `, ${recipient.role}` : ""}${recipient.company ? ` at ${recipient.company}` : ""}.`)
        : step("Chose who to write to", false, "No named person with a role was found, so the draft is addressed to the project team.")
    );
    const written = await draftEmail(ctx, keys, lead, doc.findings);
    steps.push(written.step);

    await ctx.admin.from("lead_prep").update({ status: "ready", findings: doc, draft: written.draft, steps, finished_at: new Date().toISOString() }).eq("opportunity_id", lead.id);
    return { kind: "prepared", opportunityId: lead.id, title: lead.title, draft: written.draft !== null };
  }

  return { kind: "nothing_to_do", reason: "no_candidates" };
}
