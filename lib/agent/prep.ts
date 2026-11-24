import type { SupabaseClient } from "@supabase/supabase-js";
import { writeEmail } from "../ai/email";
import type { Opportunity } from "../data";
import { formatMoney } from "../leads/extract";
import { loadKnown } from "../leads/ingest";
import { contractorsOf } from "../leads/people";
import { relatedIndex } from "../related";
import { researchLead, type ResearchLead } from "../research/run";
import type { Finding, FindingsDoc } from "../research/types";
import { OWNER_NOT_NAMED } from "../supabase/mappers";
import { DAILY_CAP, draftProblems, isCandidate, judgeTwins, MAX_CHECKED, pickRecipient, SENDER_TOKEN, STALE_WORKING_MINUTES } from "./judge";
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
}

export type AgentOutcome =
  | { kind: "prepared"; opportunityId: string; title: string; draft: boolean }
  | { kind: "skipped"; opportunityId: string; title: string; reason: string }
  | { kind: "nothing_to_do"; reason: "daily_cap" | "no_candidates" }
  | { kind: "retry_later"; opportunityId: string; title: string; error: string };

const step = (name: string, ok: boolean, note: string): PrepStep => ({ step: name, ok, note });

/** Reads everything the agent needs to decide, once per run. */
export async function createAgentContext(admin: SupabaseClient): Promise<AgentContext> {
  // A run that died half way leaves a "working" row; after a while it is cleared so the lead is tried again.
  const cutoff = new Date(Date.now() - STALE_WORKING_MINUTES * 60_000).toISOString();
  await admin.from("lead_prep").delete().eq("status", "working").lt("created_at", cutoff);

  const [known, prep, researched, actions] = await Promise.all([
    loadKnown(admin),
    admin.from("lead_prep").select("opportunity_id, status"),
    admin.from("lead_research").select("opportunity_id"),
    admin.from("lead_actions").select("opportunity_id").in("stage", ["outreach", "pipeline"]),
  ]);
  const prepRows = (prep.data ?? []) as { opportunity_id: string; status: string }[];
  const handled = new Set<string>([...prepRows.map((r) => r.opportunity_id), ...((researched.data ?? []) as { opportunity_id: string }[]).map((r) => r.opportunity_id)]);
  const prepared = new Set(prepRows.filter((r) => r.status === "ready" || r.status === "working").map((r) => r.opportunity_id));
  const underway = new Set(((actions.data ?? []) as { opportunity_id: string }[]).map((r) => r.opportunity_id));
  return { admin, known, lookup: relatedIndex(known), handled, prepared, underway };
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

/** Runs the agent for up to `maxLeads` leads, starting another only while there is time left in the serverless limit. */
export async function runAgent(admin: SupabaseClient, keys: AgentKeys, opts: { maxLeads: number; startBeforeMs: number }): Promise<{ outcomes: AgentOutcome[]; seconds: number }> {
  const startedAt = Date.now();
  const ctx = await createAgentContext(admin);
  const outcomes: AgentOutcome[] = [];
  for (let i = 0; i < opts.maxLeads; i++) {
    if (i > 0 && Date.now() - startedAt > opts.startBeforeMs) break;
    const outcome = await runAgentOnce(ctx, keys);
    outcomes.push(outcome);
    // Nothing left to do, or a service is struggling: stop instead of trying again straight away.
    if (outcome.kind === "nothing_to_do" || outcome.kind === "retry_later") break;
  }
  return { outcomes, seconds: Math.round((Date.now() - startedAt) / 1000) };
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
      // A busy or failing service is not the lead's fault: free it to be tried again later.
      console.error("EPCMst: prep agent research failed.", JSON.stringify({ lead: lead.id, error: err instanceof Error ? err.message : String(err), kind: err instanceof Error ? err.constructor.name : typeof err }));
      await ctx.admin.from("lead_prep").delete().eq("opportunity_id", lead.id).eq("status", "working");
      ctx.prepared.delete(lead.id);
      return { kind: "retry_later", opportunityId: lead.id, title: lead.title, error: err instanceof Error ? err.message : "The research failed." };
    }
    const owners = names(doc.findings, "owner");
    const contractors = names(doc.findings, "contractor");
    const people = doc.findings.filter((f) => f.kind === "person");
    steps.push(step("Researched the web", doc.findings.length > 0, `${doc.sources.length} pages read. Found ${owners.length} owner${owners.length === 1 ? "" : "s"}, ${contractors.length} contractor${contractors.length === 1 ? "" : "s"} and ${people.length} named ${people.length === 1 ? "person" : "people"}, each with its quote.`));

    if (doc.findings.length === 0) {
      steps.push(step("Stopped", false, "The web research found nothing to act on, so no email was drafted."));
      await ctx.admin.from("lead_prep").update({ status: "skipped_nothing_found", findings: doc, steps, finished_at: new Date().toISOString() }).eq("opportunity_id", lead.id);
      ctx.prepared.delete(lead.id);
      return { kind: "skipped", opportunityId: lead.id, title: lead.title, reason: "nothing found" };
    }

    // Step 3: choose who to write to.
    const recipient = pickRecipient(doc.findings);
    steps.push(
      recipient
        ? step("Chose who to write to", true, `${recipient.name}${recipient.role ? `, ${recipient.role}` : ""}${recipient.company ? ` at ${recipient.company}` : ""}.`)
        : step("Chose who to write to", false, "No named person with a role was found, so the draft is addressed to the project team.")
    );

    // Step 4: draft the email.
    let draft: PrepDraft | null = null;
    try {
      const out = await writeEmail(
        {
          senderName: SENDER_TOKEN,
          senderCompany: "SEEDA (EPCMst network)",
          lead: { headline: lead.fullTitle ?? lead.title, location: lead.location, value: lead.value ? formatMoney(lead.value) : undefined, owner: lead.owner !== OWNER_NOT_NAMED ? lead.owner : undefined, serviceLine: lead.serviceLine, kind: lead.type },
          confirmed: { owner: owners[0], contractors: [...new Set([...contractorsOf(lead), ...contractors])] },
          recipient: recipient ? { name: recipient.name, role: recipient.role, company: recipient.company, evidence: recipient.evidence } : undefined,
          angle: "specialist",
          tone: "Warm",
        },
        { apiKey: keys.gemini, model: keys.model }
      );
      const problems = draftProblems(out.body);
      if (problems.length === 0) {
        draft = { subjectA: out.subjectA, subjectB: out.subjectB, body: out.body, linkedinNote: out.linkedinNote, tone: "Warm", angle: "specialist", recipient: recipient ? { name: recipient.name, role: recipient.role, company: recipient.company, evidence: recipient.evidence } : undefined };
        steps.push(step("Drafted the email", true, "Short, plain, and signed with a placeholder for the sender’s name. It passed the checks (no placeholders, no exclamation marks, under 180 words)."));
      } else {
        steps.push(step("Drafted the email", false, `The draft was thrown away because ${problems.join(" and ")}. Use “Write with AI” in the Outreach Studio instead.`));
      }
    } catch (err) {
      steps.push(step("Drafted the email", false, `The AI could not write the draft (${err instanceof Error ? err.message : "unknown error"}). The research is saved; use “Write with AI” in the Outreach Studio.`));
    }

    await ctx.admin.from("lead_prep").update({ status: "ready", findings: doc, draft, steps, finished_at: new Date().toISOString() }).eq("opportunity_id", lead.id);
    return { kind: "prepared", opportunityId: lead.id, title: lead.title, draft: draft !== null };
  }

  return { kind: "nothing_to_do", reason: "no_candidates" };
}
