import { Opportunity, Stage } from "@/lib/data";
import { Draft, Tone, timeAgo } from "@/lib/outreach";

// snake_case DB row <-> camelCase app type. Keeps the Supabase wire format
// out of components, which only ever see the Opportunity and Draft shapes.
//
// A lead is stored in three places: the lead itself (shared by everyone), the company
// behind it (organizations), and the signed-in user's own choices about it (lead_actions).
// rowToOpportunity puts those back together so the screens can keep treating a lead
// as one object with a stage, a watch flag and an owner.

export const OWNER_NOT_NAMED = "Not identified in headline";

type OrganizationRef = { name: string; owner_type: string };

export type OpportunityRow = {
  id: string;
  ref: string;
  type: string;
  score: number;
  title: string;
  full_title: string | null;
  location: string;
  timing: string;
  timing_icon: "calendar" | "clock";
  days_left: number | null;
  phase_tag: string;
  in_scan: boolean;
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
  pipeline_tags: string[] | null;
  assignee: string;
  contact_role: string | null;
  organization_id: string | null;
  discovered_by: string | null;
  created_at?: string;
  /** Joined company row; a to-one join, but be defensive about the array form. */
  organizations?: OrganizationRef | OrganizationRef[] | null;
};

export type LeadActionRow = {
  opportunity_id: string;
  stage: Stage | null;
  watched: boolean;
  dismissed: boolean;
  updated_at: string;
};

export type DraftRow = {
  opportunity_id: string;
  subject: string;
  body: string;
  tone: Tone;
  updated_at: string;
};

export const LEAD_SELECT = "*, organizations(name, owner_type)";

const companyName = (row: OpportunityRow): string => {
  const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
  return org?.name ?? OWNER_NOT_NAMED;
};

export function rowToOpportunity(row: OpportunityRow, action?: LeadActionRow): Opportunity {
  const stage = action?.stage ?? null;
  const when = action ? timeAgo(new Date(action.updated_at).getTime()) : null;
  return {
    id: row.id,
    ref: row.ref,
    type: row.type,
    score: row.score,
    title: row.title,
    fullTitle: row.full_title ?? undefined,
    owner: companyName(row),
    location: row.location,
    timing: row.timing,
    timingIcon: row.timing_icon,
    daysLeft: row.days_left,
    phaseTag: row.phase_tag,
    inScan: row.in_scan,
    stage,
    watched: action?.watched ?? false,
    dismissed: action?.dismissed ?? false,
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
    // Derived from this user's own action, not stored on the lead.
    pipelineTime: stage ? `${stage === "pipeline" ? "Sent" : "Updated"} ${when}` : undefined,
    pipelineNote: stage === "pipeline" ? "Outreach Sent" : undefined,
    pipelineTags: row.pipeline_tags ?? undefined,
    assignee: row.assignee,
    contactRole: row.contact_role ?? undefined,
    createdAt: row.created_at,
    // When this user last changed their stage, watch or not-relevant choice; drives "stale" leads.
    actedAt: action?.updated_at,
  };
}

/** The shared part of a lead. Per-user choices and the company name live in other tables. */
export function opportunityToRow(o: Opportunity, ids: { discoveredBy: string; organizationId: string | null }) {
  return {
    id: o.id,
    ref: o.ref,
    type: o.type,
    score: o.score,
    title: o.title,
    full_title: o.fullTitle ?? null,
    location: o.location,
    timing: o.timing,
    timing_icon: o.timingIcon,
    days_left: o.daysLeft,
    phase_tag: o.phaseTag,
    in_scan: o.inScan,
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
    pipeline_tags: o.pipelineTags ?? null,
    assignee: o.assignee,
    contact_role: o.contactRole ?? null,
    organization_id: ids.organizationId,
    discovered_by: ids.discoveredBy,
  };
}

export function actionToRow(userId: string, opportunityId: string, o: Pick<Opportunity, "stage" | "watched" | "dismissed">) {
  return {
    user_id: userId,
    opportunity_id: opportunityId,
    stage: o.stage,
    watched: o.watched,
    dismissed: o.dismissed,
    updated_at: new Date().toISOString(),
  };
}

export function rowToDraft(row: DraftRow): Draft {
  return { subject: row.subject, body: row.body, tone: row.tone, updatedAt: new Date(row.updated_at).getTime() };
}

export function draftToRow(userId: string, opportunityId: string, draft: Draft) {
  return {
    user_id: userId,
    opportunity_id: opportunityId,
    subject: draft.subject,
    body: draft.body,
    tone: draft.tone,
    updated_at: new Date(draft.updatedAt).toISOString(),
  };
}
