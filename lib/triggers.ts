"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Explained } from "./ai/explain";
import { useAuth } from "./AuthContext";
import type { EventKind } from "./leads/events";
import { createClient, isSupabaseConfigured } from "./supabase/client";

// What the brief and the lead pages read: triggers (things that happened to a lead), the last automatic run, and the AI
// summaries prepared ahead of time. All three tables are read-only for people, and are missing until migration 0009 is
// run, so every read says whether the feature is available instead of failing.

export interface TriggerEvent {
  id: string;
  opportunityId: string;
  kind: EventKind;
  title: string;
  detail: string | null;
  link: string | null;
  occurredAt: string;
  /** When the app learned of it. A trigger is "new" to a person when this is after their previous visit. */
  createdAt: string;
}

export interface LastRun {
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  added: number;
  updated: number;
  triggers: number;
  failedSearches: number;
}

interface EventRow {
  id: string;
  opportunity_id: string;
  kind: EventKind;
  title: string;
  detail: string | null;
  link: string | null;
  occurred_at: string;
  created_at: string;
}

const toEvent = (r: EventRow): TriggerEvent => ({ id: r.id, opportunityId: r.opportunity_id, kind: r.kind, title: r.title, detail: r.detail, link: r.link, occurredAt: r.occurred_at, createdAt: r.created_at });

export const KIND_LABEL: Record<EventKind, string> = {
  new_lead: "New lead",
  new_story: "New coverage",
  stage_change: "Stage change",
  contractor_named: "Contractor named",
};

export interface TriggerFeed {
  events: TriggerEvent[];
  lastRun: LastRun | null;
  loading: boolean;
  /** False when the triggers table doesn't exist yet. */
  available: boolean;
  reload: () => void;
}

/** The newest triggers across all leads, and when the automatic run last finished. */
export function useTriggerFeed(limit = 120): TriggerFeed {
  const { user } = useAuth();
  const supabase = useRef(isSupabaseConfigured ? createClient() : null).current;
  const [state, setState] = useState<Omit<TriggerFeed, "reload">>({ events: [], lastRun: null, loading: true, available: true });
  const [tick, setTick] = useState(0);
  const userId = user?.id;

  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    void (async () => {
      const [events, runs] = await Promise.all([
        supabase.from("lead_events").select("*").order("created_at", { ascending: false }).limit(limit),
        supabase.from("job_runs").select("started_at, finished_at, ok, summary").eq("job", "daily-scan").order("started_at", { ascending: false }).limit(1),
      ]);
      if (cancelled) return;
      const run = (runs.data?.[0] ?? null) as { started_at: string; finished_at: string | null; ok: boolean | null; summary: { added?: number; updated?: number; triggers?: number; failedSearches?: number } | null } | null;
      setState({
        events: ((events.data ?? []) as EventRow[]).map(toEvent),
        lastRun: run ? { startedAt: run.started_at, finishedAt: run.finished_at, ok: run.ok, added: run.summary?.added ?? 0, updated: run.summary?.updated ?? 0, triggers: run.summary?.triggers ?? 0, failedSearches: run.summary?.failedSearches ?? 0 } : null,
        loading: false,
        available: !events.error,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId, limit, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/** The triggers for one lead, newest first. */
export function useLeadTriggers(opportunityId: string): { events: TriggerEvent[]; loading: boolean } {
  const { user } = useAuth();
  const supabase = useRef(isSupabaseConfigured ? createClient() : null).current;
  const [state, setState] = useState<{ forId: string; events: TriggerEvent[] } | null>(null);
  const userId = user?.id;

  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    void supabase
      .from("lead_events")
      .select("*")
      .eq("opportunity_id", opportunityId)
      .order("occurred_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!cancelled) setState({ forId: opportunityId, events: ((data ?? []) as EventRow[]).map(toEvent) });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, userId, opportunityId]);

  const ready = state?.forId === opportunityId;
  return { events: ready ? state.events : [], loading: !ready };
}

/** Prepared AI summaries for several leads at once, keyed by lead id. Empty until loaded or when none exist. */
export function usePreparedSummaries(ids: string[]): Record<string, Explained> {
  const { user } = useAuth();
  const supabase = useRef(isSupabaseConfigured ? createClient() : null).current;
  const [found, setFound] = useState<{ key: string; byId: Record<string, Explained> } | null>(null);
  const userId = user?.id;
  const key = ids.join(",");

  useEffect(() => {
    if (!supabase || !userId || !key) return;
    let cancelled = false;
    void supabase
      .from("lead_insights")
      .select("opportunity_id, summary")
      .in("opportunity_id", key.split(","))
      .then(({ data }) => {
        if (cancelled) return;
        setFound({ key, byId: Object.fromEntries((data ?? []).map((r: { opportunity_id: string; summary: Explained }) => [r.opportunity_id, r.summary])) });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, userId, key]);

  return found?.key === key ? found.byId : {};
}

/** The AI summary prepared ahead of time for a lead, if there is one. */
export function usePreparedSummary(opportunityId: string): { summary: Explained; generatedAt: string } | null {
  const { user } = useAuth();
  const supabase = useRef(isSupabaseConfigured ? createClient() : null).current;
  const [found, setFound] = useState<{ forId: string; summary: Explained; generatedAt: string } | null>(null);
  const userId = user?.id;

  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    void supabase
      .from("lead_insights")
      .select("summary, generated_at")
      .eq("opportunity_id", opportunityId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setFound({ forId: opportunityId, summary: data.summary as Explained, generatedAt: data.generated_at as string });
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, userId, opportunityId]);

  return found?.forId === opportunityId ? { summary: found.summary, generatedAt: found.generatedAt } : null;
}
