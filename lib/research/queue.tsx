"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Stage } from "../data";
import { useAuth } from "../AuthContext";
import { useStore } from "../store";
import { runResearch } from "./client";

// Researches leads in the background, one at a time, so the owner, contractors and people are
// ready when the lead is opened. Two things start it: shortlisting a lead, and the "Research top 5"
// button. The server caps how many one person can run per day, and the queue stops when that is hit.

export interface Batch {
  total: number;
  done: number;
  failed: number;
  /** Set when the queue stopped early, with the reason in plain words. */
  stoppedBecause?: string;
}

interface QueueValue {
  /** Leads being researched now or waiting their turn. */
  busy: Set<string>;
  /** Progress of the "Research top 5" run, or null when none is running or just finished. */
  batch: Batch | null;
  enqueue: (ids: string[], opts?: { batch?: boolean }) => void;
}

const QueueContext = createContext<QueueValue | null>(null);

const PAUSE_BETWEEN_MS = 800;

export function ResearchQueueProvider({ children }: { children: React.ReactNode }) {
  const { session, user } = useAuth();
  const { opportunities, loaded, researchFor, setResearch } = useStore();

  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<Batch | null>(null);

  const queue = useRef<{ id: string; inBatch: boolean }[]>([]);
  const pumping = useRef(false);
  const runningId = useRef<string | null>(null);
  const failedBefore = useRef(new Set<string>());
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session?.access_token ?? null;
  const researchForRef = useRef(researchFor);
  researchForRef.current = researchFor;
  const setResearchRef = useRef(setResearch);
  setResearchRef.current = setResearch;

  const publishBusy = useCallback((running?: string) => {
    const next = new Set(queue.current.map((j) => j.id));
    if (running) next.add(running);
    setBusy(next);
  }, []);

  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    let stopped: string | undefined;
    while (queue.current.length > 0) {
      const job = queue.current.shift()!;
      const token = tokenRef.current;
      if (!token) {
        queue.current = [];
        break;
      }
      runningId.current = job.id;
      publishBusy(job.id);
      const outcome = await runResearch(token, job.id);
      runningId.current = null;
      if (outcome.ok) {
        setResearchRef.current(outcome.row);
        if (job.inBatch) setBatch((b) => (b ? { ...b, done: b.done + 1 } : b));
      } else {
        failedBefore.current.add(job.id);
        if (job.inBatch) setBatch((b) => (b ? { ...b, failed: b.failed + 1 } : b));
        // Running out of daily allowance or missing keys won't fix itself on the next lead.
        if (outcome.code === "limit" || outcome.code === "not_configured") {
          stopped = outcome.code === "limit" ? "You've reached today's research limit." : "Research isn't switched on yet.";
          queue.current = [];
        }
      }
      publishBusy();
      if (queue.current.length > 0) await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_MS));
    }
    pumping.current = false;
    publishBusy();
    setBatch((b) => (b ? { ...b, stoppedBecause: stopped ?? b.stoppedBecause } : b));
    // Leave the finished summary up for a moment, then clear it.
    window.setTimeout(() => setBatch((b) => (b && !pumping.current ? null : b)), 12_000);
  }, [publishBusy]);

  const enqueue = useCallback(
    (ids: string[], opts?: { batch?: boolean }) => {
      const fresh = [...new Set(ids)].filter(
        (id) => !researchForRef.current(id) && runningId.current !== id && !queue.current.some((j) => j.id === id) && !failedBefore.current.has(id)
      );
      if (fresh.length === 0) return;
      const inBatch = Boolean(opts?.batch);
      if (inBatch) setBatch({ total: fresh.length, done: 0, failed: 0 });
      queue.current.push(...fresh.map((id) => ({ id, inBatch })));
      publishBusy();
      void pump();
    },
    [pump, publishBusy]
  );

  // Shortlisting a lead starts its research. Only a change made during this visit counts: leads that
  // were already shortlisted when the page loaded are not researched all at once.
  const previousStages = useRef<Map<string, Stage | null> | null>(null);
  useEffect(() => {
    if (!loaded) {
      previousStages.current = null;
      return;
    }
    const current = new Map(opportunities.map((o) => [o.id, o.stage] as const));
    const before = previousStages.current;
    if (before) {
      const newlyShortlisted = opportunities.filter((o) => o.stage && o.type === "News" && !o.dismissed && before.has(o.id) && !before.get(o.id)).map((o) => o.id);
      if (newlyShortlisted.length) enqueue(newlyShortlisted);
    }
    previousStages.current = current;
  }, [opportunities, loaded, enqueue]);

  // A different person signing in starts with a clean queue.
  useEffect(() => {
    queue.current = [];
    failedBefore.current = new Set();
    previousStages.current = null;
    setBusy(new Set());
    setBatch(null);
  }, [user?.id]);

  const value = useMemo<QueueValue>(() => ({ busy, batch, enqueue }), [busy, batch, enqueue]);
  return <QueueContext.Provider value={value}>{children}</QueueContext.Provider>;
}

export function useResearchQueue() {
  const ctx = useContext(QueueContext);
  if (!ctx) throw new Error("useResearchQueue must be used inside <ResearchQueueProvider>");
  return ctx;
}
