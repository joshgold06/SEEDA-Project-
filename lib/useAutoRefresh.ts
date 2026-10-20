"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { runDiscover } from "./leads/client";
import { SEARCH_PRESETS } from "./leads/presets";
import { useStore } from "./store";

const STALE_MS = 6 * 60 * 60 * 1000; // refresh at most every 6 hours per person
const EMPTY_RETRY_MS = 10 * 60 * 1000; // an empty list retries sooner, but not in a loop

export interface RefreshState {
  running: boolean;
  done: number;
  total: number;
  added: number;
  error: string | null;
  finished: boolean;
}

const IDLE: RefreshState = { running: false, done: 0, total: SEARCH_PRESETS.length, added: 0, error: null, finished: false };

/**
 * Runs every seed search in turn so the Morning Scan is never empty. Starts by itself
 * on a first visit or when the leads are stale, and can also be started by hand.
 */
export function useAutoRefresh(visibleCount: number) {
  const { session, user, profile } = useAuth();
  const { loaded, reset } = useStore();
  const [state, setState] = useState<RefreshState>(IDLE);
  const started = useRef(false);

  const refresh = useCallback(async () => {
    if (!session || !user) return;
    const token = session.access_token;
    setState({ ...IDLE, running: true });
    let added = 0;
    let firstError: string | null = null;
    for (let i = 0; i < SEARCH_PRESETS.length; i++) {
      const outcome = await runDiscover(token, { presetId: SEARCH_PRESETS[i].id }, profile?.initials);
      if (outcome.ok) {
        added += outcome.result.added;
        if (outcome.result.added > 0) reset(); // show new leads as they arrive
      } else if (!firstError) {
        firstError = outcome.error;
      }
      setState({ running: true, done: i + 1, total: SEARCH_PRESETS.length, added, error: firstError, finished: false });
    }
    try {
      window.localStorage.setItem(`epcmst-auto-run:${user.id}`, String(Date.now()));
    } catch {
      // not recorded; it will simply run again next visit
    }
    reset();
    setState({ running: false, done: SEARCH_PRESETS.length, total: SEARCH_PRESETS.length, added, error: firstError, finished: true });
  }, [session, user, profile?.initials, reset]);

  useEffect(() => {
    if (!loaded || !session || !user || started.current) return;
    let last = 0;
    try {
      last = Number(window.localStorage.getItem(`epcmst-auto-run:${user.id}`) ?? 0);
    } catch {
      // unreadable: treat as never run
    }
    const age = Date.now() - last;
    if (age > STALE_MS || (visibleCount === 0 && age > EMPTY_RETRY_MS)) {
      started.current = true;
      void refresh();
    }
  }, [loaded, session, user, visibleCount, refresh]);

  return { ...state, refresh };
}
