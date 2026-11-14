import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lead } from "./schema";

// A trigger is something that happened to a lead that a person may want to follow up. The builders below are pure so
// they can be checked without a database; recordEvents is the only part that writes.

export type EventKind = "new_lead" | "new_story" | "stage_change" | "contractor_named";

export interface LeadEventInput {
  opportunityId: string;
  kind: EventKind;
  title: string;
  detail?: string;
  link?: string;
  /** The same trigger arriving again (a repeated run) must produce the same key, so it is stored once. */
  dedupeKey: string;
  occurredAt?: string;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const httpLink = (url: string | undefined) => (url && /^https?:\/\//.test(url) ? url : undefined);

/** A lead the app had not seen before. */
export function newLeadEvent(lead: Lead): LeadEventInput {
  return {
    opportunityId: lead.id,
    kind: "new_lead",
    title: clip(lead.title, 300),
    detail: `${lead.signalType} in ${lead.location}${lead.organizationKnown ? ` · ${lead.organization}` : ""} · score ${lead.score}`,
    link: httpLink(lead.sourceUrl),
    dedupeKey: "new",
    occurredAt: lead.publishedAt,
  };
}

// Words that describe nearly any energy or mining project in Western Canada. Two headlines sharing only these are about
// the same kind of thing, not necessarily the same project.
const GENERIC = new Set(
  ("final investment decision oil sands gas natural pipeline plant project projects expansion construction approval approved energy power mine mining hydro facility " +
    "canada canadian alberta british columbia saskatchewan manitoba ontario government new plan plans billion million province provincial federal company announces announced " +
    "petroleum refinery potash carbon capture hydrogen lithium nuclear transmission terminal export exports").split(" ")
);

export interface StoryMatch {
  basis: "value" | "words";
  distinct: string[];
  overlap: number;
}

/**
 * Whether a possible match is strong enough to tell people "new coverage of a project you have". The match on the lead
 * page is a hint a person can weigh, but a trigger is pushed at them, so it must clear a higher bar: the same dollar
 * figure (the match already needs two shared words and differing figures rule a pair out), or a large overlap on at
 * least two words that are not generic project vocabulary.
 */
export function isStrongStoryMatch(match: StoryMatch): boolean {
  if (match.basis === "value") return true;
  const names = match.distinct.filter((w) => !GENERIC.has(w));
  return names.length >= 2 && match.overlap >= 0.5;
}

/** A new story that looks like it is about a project already saved: the trigger belongs to the saved lead. */
export function newStoryEvent(existingLeadId: string, story: Lead, reason: string): LeadEventInput {
  return {
    opportunityId: existingLeadId,
    kind: "new_story",
    title: clip(`New coverage: ${story.title}`, 300),
    detail: `${story.publisher} · ${reason}`,
    link: httpLink(story.sourceUrl),
    dedupeKey: `story:${story.id}`,
    occurredAt: story.publishedAt,
  };
}

/** A register moved a saved project from one stage to another. */
export function stageChangeEvent(lead: Lead, from: string, to: string): LeadEventInput {
  return {
    opportunityId: lead.id,
    kind: "stage_change",
    title: clip(`${lead.organizationKnown ? `${lead.organization}: ` : ""}${from} → ${to}`, 300),
    detail: `${lead.publisher} now lists "${lead.title}" as ${to}.`,
    link: httpLink(lead.sourceUrl),
    dedupeKey: `stage:${to}`,
  };
}

/** A contractor appeared on a saved lead that had none. */
export function contractorNamedEvent(lead: Lead): LeadEventInput | null {
  if (!lead.contractors.length) return null;
  const names = lead.contractors.slice(0, 3).join(", ");
  return {
    opportunityId: lead.id,
    kind: "contractor_named",
    title: clip(`Contractor named: ${names}`, 300),
    detail: `${lead.publisher} now names a contractor for "${lead.title}".`,
    link: httpLink(lead.sourceUrl),
    dedupeKey: `contractor:${names.toLowerCase()}`,
  };
}

/** Stores triggers, ignoring any already stored. Returns how many were new. Does nothing without a client. */
export async function recordEvents(db: SupabaseClient | null, events: LeadEventInput[]): Promise<number> {
  if (!db || events.length === 0) return 0;
  const rows = events.map((e) => ({
    opportunity_id: e.opportunityId,
    kind: e.kind,
    title: e.title,
    detail: e.detail ?? null,
    link: e.link ?? null,
    dedupe_key: e.dedupeKey,
    ...(e.occurredAt ? { occurred_at: e.occurredAt } : {}),
  }));
  const { data, error } = await db.from("lead_events").upsert(rows, { onConflict: "opportunity_id,dedupe_key", ignoreDuplicates: true }).select("id");
  if (error) {
    // The table may not exist yet or the key may be wrong: triggers are an extra and must never stop a scan.
    console.warn("EPCMst: could not store triggers.", error.message);
    return 0;
  }
  return data?.length ?? 0;
}
