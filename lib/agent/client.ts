"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthContext";
import { createClient, isSupabaseConfigured } from "../supabase/client";
import { rowToPrep, type PrepDbRow, type PrepRow } from "./types";

// What the brief reads about the prep agent's work. The table is missing until migration 0010 is run, so the read says
// whether the feature is available instead of failing.

export interface PrepFeed {
  ready: PrepRow[];
  /** Leads the agent looked at and skipped (a duplicate, or nothing found on the web). */
  skipped: number;
  loading: boolean;
  available: boolean;
  reload: () => void;
}

export function usePrepFeed(): PrepFeed {
  const { user } = useAuth();
  const supabase = useRef(isSupabaseConfigured ? createClient() : null).current;
  const [state, setState] = useState<Omit<PrepFeed, "reload">>({ ready: [], skipped: 0, loading: true, available: true });
  const [tick, setTick] = useState(0);
  const userId = user?.id;

  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    void (async () => {
      const [ready, skipped] = await Promise.all([
        supabase.from("lead_prep").select("*").eq("status", "ready").order("created_at", { ascending: false }).limit(20),
        supabase.from("lead_prep").select("opportunity_id", { count: "exact", head: true }).in("status", ["skipped_duplicate", "skipped_nothing_found"]),
      ]);
      if (cancelled) return;
      setState({ ready: ((ready.data ?? []) as PrepDbRow[]).map(rowToPrep), skipped: skipped.count ?? 0, loading: false, available: !ready.error });
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, userId, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export type PrepareOutcome =
  | { ok: true; message: string; prepared: boolean }
  | { ok: false; error: string };

/** Asks the server to prepare the next lead now. It can take up to a minute. */
export async function requestPrepare(token: string): Promise<PrepareOutcome> {
  try {
    const res = await fetch("/api/agent/run", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    const data = (await res.json().catch(() => ({}))) as { error?: string; outcome?: { kind: string; title?: string; reason?: string; error?: string; draft?: boolean } };
    if (!res.ok) return { ok: false, error: data.error ?? "The agent could not run." };
    const o = data.outcome;
    if (!o) return { ok: false, error: "The agent gave no answer." };
    if (o.kind === "prepared") return { ok: true, prepared: true, message: `Prepared “${o.title}”${o.draft ? " with a drafted email" : " (the email draft failed, so only the research is saved)"}.` };
    if (o.kind === "skipped") return { ok: true, prepared: false, message: `Looked at “${o.title}” but found nothing to act on, so it was skipped. Press again for the next one.` };
    if (o.kind === "retry_later") return { ok: false, error: `The research on “${o.title}” could not finish${o.error ? `: ${o.error}` : ""} That lead is set aside for a day; press the button again to try the next one.` };
    return { ok: true, prepared: false, message: o.reason === "daily_cap" ? "The agent has already prepared its leads for today. It limits itself so the free search and AI plans last." : "No new lead is good enough and not a duplicate of one already being worked." };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}
