import type { FindingsDoc } from "../research/types";
import { FindingsDocSchema } from "../research/types";

// What the prep agent leaves behind for a person to review. Safe to import from the browser: no server code in here.

export type PrepStatus = "working" | "ready" | "skipped_duplicate" | "skipped_nothing_found";

export interface PrepStep {
  step: string;
  ok: boolean;
  note: string;
  /** When a later run last tried this step; used to take turns between drafts that failed. */
  at?: string;
}

export interface PrepDraft {
  subjectA: string;
  subjectB: string;
  /** Signed with the SENDER_NAME token, which is replaced by the person who opens it. */
  body: string;
  linkedinNote: string;
  tone: "Direct" | "Warm" | "Technical";
  angle: "specialist" | "schedule" | "field" | "heavy";
  recipient?: { name: string; role?: string; company?: string; evidence?: string };
}

export interface PrepRow {
  opportunityId: string;
  status: PrepStatus;
  findings: FindingsDoc | null;
  draft: PrepDraft | null;
  steps: PrepStep[];
  createdAt: string;
  finishedAt: string | null;
}

export type PrepDbRow = {
  opportunity_id: string;
  status: PrepStatus;
  findings: unknown;
  draft: unknown;
  steps: unknown;
  created_at: string;
  finished_at: string | null;
};

export { SENDER_TOKEN, fillSender } from "./judge";

const isStep = (s: unknown): s is PrepStep => typeof s === "object" && s !== null && typeof (s as PrepStep).step === "string" && typeof (s as PrepStep).note === "string";

export function rowToPrep(row: PrepDbRow): PrepRow {
  const findings = FindingsDocSchema.safeParse(row.findings);
  const d = row.draft as Partial<PrepDraft> | null;
  const draft: PrepDraft | null =
    d && typeof d.body === "string" && typeof d.subjectA === "string"
      ? { subjectA: d.subjectA, subjectB: typeof d.subjectB === "string" ? d.subjectB : d.subjectA, body: d.body, linkedinNote: typeof d.linkedinNote === "string" ? d.linkedinNote : "", tone: d.tone ?? "Warm", angle: d.angle ?? "specialist", recipient: d.recipient }
      : null;
  return {
    opportunityId: row.opportunity_id,
    status: row.status,
    findings: findings.success ? findings.data : null,
    draft,
    steps: Array.isArray(row.steps) ? row.steps.filter(isStep).map((s) => ({ step: s.step, ok: Boolean(s.ok), note: s.note })) : [],
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}
