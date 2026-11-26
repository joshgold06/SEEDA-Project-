import type { Opportunity } from "../data";
import type { Finding } from "../research/types";

// The prep agent's decisions that must always hold. They are plain functions, not part of any prompt, so they apply
// whatever the AI writes. Nothing here imports server code, so it can be checked on its own.

/** Only leads at least this good are worth spending web searches and AI calls on. */
export const MIN_SCORE = 60;
/** Leads fully prepared in 24 hours, across everyone. The free search and AI plans are small. */
export const DAILY_CAP = 4;
/** How many candidates one run will look at before giving up (the duplicate check is cheap, the research is not). */
export const MAX_CHECKED = 12;
/** A run that started this long ago is treated as crashed, and its lead can be picked up again. */
export const STALE_WORKING_MINUTES = 10;

/** A lead whose research failed waits this long before it is tried again, so one slow lead cannot block the queue. */
export const SET_ASIDE_HOURS = 24;
/** The step that marks such a lead. Its row stays "working", which nothing shows to people. */
export const SET_ASIDE_STEP = "Set aside";

export const isSetAside = (steps: unknown) => Array.isArray(steps) && steps.some((s) => (s as { step?: unknown } | null)?.step === SET_ASIDE_STEP);

/** Whether a "working" row should be removed, which makes its lead available again: a crashed run soon, a set-aside lead after a day. */
export function shouldClearWorking(row: { created_at: string; steps: unknown }, now: number): boolean {
  const age = now - new Date(row.created_at).getTime();
  return age > (isSetAside(row.steps) ? SET_ASIDE_HOURS * 3_600_000 : STALE_WORKING_MINUTES * 60_000);
}

/** The word the agent signs with, because it does not know which person will open the draft. */
export const SENDER_TOKEN = "SENDER_NAME";
export const fillSender = (text: string, name: string) => text.split(SENDER_TOKEN).join(name);

/** A lead is worth preparing if it is a news story or a register entry, in the scan, and scores well. */
export function isCandidate(o: Pick<Opportunity, "type" | "inScan" | "dismissed" | "score">): boolean {
  return (o.type === "News" || o.type === "Regulatory") && o.inScan && !o.dismissed && o.score >= MIN_SCORE;
}

export interface Twin {
  id: string;
  title: string;
}

/**
 * Whether another lead about the same project stops this one. The same company must not be approached twice about one
 * project, so a lead is skipped when a twin is already being contacted (at Outreach or Pipeline for anyone) or has
 * already been prepared by the agent.
 */
export function judgeTwins(twins: Twin[], prepared: ReadonlySet<string>, underway: ReadonlySet<string>): { twin: Twin; why: "being_contacted" | "already_prepared" } | null {
  for (const t of twins) if (underway.has(t.id)) return { twin: t, why: "being_contacted" };
  for (const t of twins) if (prepared.has(t.id)) return { twin: t, why: "already_prepared" };
  return null;
}

/**
 * Whether research found something a person can act on. An owner alone is not enough: the owner was usually already
 * known, and there is nobody to write to and no contractor to approach. Such a lead is skipped, not put in front of someone.
 */
export function hasSomethingToAct(findings: Pick<Finding, "kind">[]): boolean {
  return findings.some((f) => f.kind === "person" || f.kind === "contractor");
}

const TOP_LEVEL =/\b(chief|ceo|chairman|chair|founder)\b/i;
const HANDS_ON = /\b(project|projects|construction|procurement|supply chain|engineering|operations|delivery|development)\b/i;

function isTopLevel(role: string): boolean {
  if (TOP_LEVEL.test(role)) return true;
  // "President" is top level; "Vice President, Projects" is not.
  return /\bpresident\b/i.test(role) && !/\b(vice|vp|svp|evp)\b/i.test(role);
}

/** Who the email should be for: someone who runs or buys project work before a chief executive, and a named role before none. */
export function pickRecipient(findings: Finding[]): Finding | null {
  const rank = (f: Finding) => (!f.role ? 0 : isTopLevel(f.role) ? 1 : HANDS_ON.test(f.role) ? 3 : 2);
  const people = findings.filter((f) => f.kind === "person");
  if (people.length === 0) return null;
  return [...people].sort((a, b) => rank(b) - rank(a))[0];
}

const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/** Why a draft must not be shown, or an empty list when it passes. The prompt asks for these; the code makes sure. */
export function draftProblems(body: string): string[] {
  const problems: string[] = [];
  if (!body.includes(SENDER_TOKEN)) problems.push("it is not signed");
  if (/\[[^\]]{1,40}\]/.test(body)) problems.push("it contains a placeholder in square brackets");
  if (body.includes("!")) problems.push("it contains an exclamation mark");
  if (wordCount(body) > 180) problems.push("it is longer than 180 words");
  if (wordCount(body) < 25) problems.push("it is too short to be an email");
  return problems;
}
