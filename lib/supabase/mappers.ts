import { Opportunity, Stage } from "@/lib/data";
import { Draft, Tone } from "@/lib/outreach";

// snake_case DB row <-> camelCase app type. Keeps the Supabase wire format
// out of components, which only ever see the existing Opportunity/Draft shapes.

export type OpportunityRow = {
  id: string;
  ref: string;
  type: string;
  score: number;
  title: string;
  full_title: string | null;
  owner: string;
  location: string;
  timing: string;
  timing_icon: "calendar" | "clock";
  days_left: number | null;
  phase_tag: string;
  in_scan: boolean;
  stage: Stage | null;
  watched: boolean;
  dismissed: boolean;
  value: number | null;
  category: string | null;
  source_id: string | null;
  deadline_text: string | null;
  overview: string | null;
  insight: string | null;
  match_percent: number | null;
  relevance: Opportunity["relevance"] | null;
  involved: Opportunity["involved"] | null;
  project_type: Opportunity["projectType"] | null;
  scale: Opportunity["scale"] | null;
  current_stage: Opportunity["currentStage"] | null;
  documents: Opportunity["documents"] | null;
  service_line: string | null;
  pipeline_time: string | null;
  pipeline_note: string | null;
  pipeline_tags: string[] | null;
  assignee: string;
  contact_role: string | null;
};

export type DraftRow = {
  opportunity_id: string;
  subject: string;
  body: string;
  tone: Tone;
  updated_at: string;
};

export function rowToOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    ref: row.ref,
    type: row.type,
    score: row.score,
    title: row.title,
    fullTitle: row.full_title ?? undefined,
    owner: row.owner,
    location: row.location,
    timing: row.timing,
    timingIcon: row.timing_icon,
    daysLeft: row.days_left,
    phaseTag: row.phase_tag,
    inScan: row.in_scan,
    stage: row.stage,
    watched: row.watched,
    dismissed: row.dismissed,
    value: row.value ?? undefined,
    category: row.category ?? undefined,
    sourceId: row.source_id ?? undefined,
    deadlineText: row.deadline_text ?? undefined,
    overview: row.overview ?? undefined,
    insight: row.insight ?? undefined,
    matchPercent: row.match_percent ?? undefined,
    relevance: row.relevance ?? undefined,
    involved: row.involved ?? undefined,
    projectType: row.project_type ?? undefined,
    scale: row.scale ?? undefined,
    currentStage: row.current_stage ?? undefined,
    documents: row.documents ?? undefined,
    serviceLine: row.service_line ?? undefined,
    pipelineTime: row.pipeline_time ?? undefined,
    pipelineNote: row.pipeline_note ?? undefined,
    pipelineTags: row.pipeline_tags ?? undefined,
    assignee: row.assignee,
    contactRole: row.contact_role ?? undefined,
  };
}

export function opportunityToRow(o: Opportunity): OpportunityRow {
  return {
    id: o.id,
    ref: o.ref,
    type: o.type,
    score: o.score,
    title: o.title,
    full_title: o.fullTitle ?? null,
    owner: o.owner,
    location: o.location,
    timing: o.timing,
    timing_icon: o.timingIcon,
    days_left: o.daysLeft,
    phase_tag: o.phaseTag,
    in_scan: o.inScan,
    stage: o.stage,
    watched: o.watched,
    dismissed: o.dismissed,
    value: o.value ?? null,
    category: o.category ?? null,
    source_id: o.sourceId ?? null,
    deadline_text: o.deadlineText ?? null,
    overview: o.overview ?? null,
    insight: o.insight ?? null,
    match_percent: o.matchPercent ?? null,
    relevance: o.relevance ?? null,
    involved: o.involved ?? null,
    project_type: o.projectType ?? null,
    scale: o.scale ?? null,
    current_stage: o.currentStage ?? null,
    documents: o.documents ?? null,
    service_line: o.serviceLine ?? null,
    pipeline_time: o.pipelineTime ?? null,
    pipeline_note: o.pipelineNote ?? null,
    pipeline_tags: o.pipelineTags ?? null,
    assignee: o.assignee,
    contact_role: o.contactRole ?? null,
  };
}

export function rowToDraft(row: DraftRow): Draft {
  return { subject: row.subject, body: row.body, tone: row.tone, updatedAt: new Date(row.updated_at).getTime() };
}

export function draftToRow(opportunityId: string, draft: Draft): DraftRow {
  return {
    opportunity_id: opportunityId,
    subject: draft.subject,
    body: draft.body,
    tone: draft.tone,
    updated_at: new Date(draft.updatedAt).toISOString(),
  };
}
