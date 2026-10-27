"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Opportunity } from "./data";
import { useAuth } from "./AuthContext";
import { getPreviousVisit, isNewSince } from "./lastVisit";
import { contractorsOf } from "./leads/people";
import { regionOf } from "./leads/geo";
import { ACTIVE_REGIONS, INDUSTRIES, SIGNAL_PHASE_TAG, type Region } from "./leads/taxonomy";
import { createClient, isSupabaseConfigured } from "./supabase/client";
import { useToast } from "@/components/Toast";
import { useWeights } from "./weights";

// The organizer: one set of filters shared by the Morning Scan list, the Shortlist and the Map,
// remembered between visits, with named combinations ("saved views") kept in the database.

export interface Filters {
  regions: Region[];
  industries: string[];
  signals: string[];
  minScore: number;
  contractorOnly: boolean;
  watchedOnly: boolean;
  newOnly: boolean;
}

export const NO_FILTERS: Filters = { regions: [], industries: [], signals: [], minScore: 0, contractorOnly: false, watchedOnly: false, newOnly: false };

export const SIGNAL_CHOICES: string[] = Object.values(SIGNAL_PHASE_TAG);
export const SCORE_CHOICES = [0, 50, 65];

export interface SavedView {
  id: string;
  name: string;
  filters: Filters;
  createdAt: number;
}

const list = <T extends string>(raw: unknown, allowed: readonly T[]): T[] =>
  Array.isArray(raw) ? allowed.filter((a) => raw.includes(a)) : [];

/** Reads filters from storage or the database, keeping only values the app still knows about. */
export function sanitizeFilters(raw: unknown): Filters {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    regions: list(r.regions, ACTIVE_REGIONS),
    industries: list(r.industries, INDUSTRIES),
    signals: list(r.signals, SIGNAL_CHOICES),
    minScore: SCORE_CHOICES.includes(Number(r.minScore)) ? Number(r.minScore) : 0,
    contractorOnly: r.contractorOnly === true,
    watchedOnly: r.watchedOnly === true,
    newOnly: r.newOnly === true,
  };
}

export const countActive = (f: Filters) =>
  f.regions.length + f.industries.length + f.signals.length + (f.minScore > 0 ? 1 : 0) + Number(f.contractorOnly) + Number(f.watchedOnly) + Number(f.newOnly);

/** A lead's industries: the extractor stores them as "Energy / Mining". */
export const industriesOf = (o: Pick<Opportunity, "category">): string[] => (o.category ?? "").split(" / ").filter((i) => INDUSTRIES.includes(i));

interface Ctx {
  scoreOf: (o: Opportunity) => number;
  previousVisit: string | null;
}

export function leadMatches(o: Opportunity, f: Filters, ctx: Ctx): boolean {
  if (f.regions.length) {
    const region = regionOf(o);
    if (!region || !f.regions.includes(region)) return false;
  }
  if (f.industries.length && !industriesOf(o).some((i) => f.industries.includes(i))) return false;
  if (f.signals.length && !f.signals.includes(o.phaseTag)) return false;
  if (f.minScore > 0 && ctx.scoreOf(o) < f.minScore) return false;
  if (f.contractorOnly && contractorsOf(o).length === 0) return false;
  if (f.watchedOnly && !o.watched) return false;
  // Without a previous visit everything is new, so the toggle can't narrow anything yet.
  if (f.newOnly && ctx.previousVisit && !isNewSince(o.createdAt, ctx.previousVisit)) return false;
  return true;
}

interface FiltersValue {
  filters: Filters;
  setFilters: (next: Filters | ((prev: Filters) => Filters)) => void;
  clear: () => void;
  activeCount: number;
  hasPreviousVisit: boolean;
  /** True if the lead passes the current filters. */
  matches: (o: Opportunity) => boolean;
  /** Same check against a different set of filters, used to count choices in the panel. */
  matchesWith: (o: Opportunity, f: Filters) => boolean;
  views: SavedView[];
  viewsAvailable: boolean;
  saveView: (name: string) => Promise<boolean>;
  deleteView: (id: string) => void;
  applyView: (view: SavedView) => void;
}

const FiltersContext = createContext<FiltersValue | null>(null);

type ViewRow = { id: string; name: string; filters: unknown; created_at: string };

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { scoreOf } = useWeights();
  const toast = useToast();
  const userId = user?.id ?? null;
  const [filters, setFiltersState] = useState<Filters>(NO_FILTERS);
  const [views, setViews] = useState<SavedView[]>([]);
  const [viewsAvailable, setViewsAvailable] = useState(true);
  const supabase = useRef(isSupabaseConfigured ? createClient() : null).current;
  const previousVisit = userId ? getPreviousVisit(userId) : null;
  const storageKey = userId ? `epcmst-filters:${userId}` : null;

  // Remembered per person, so the list looks the way they left it.
  useEffect(() => {
    setFiltersState(NO_FILTERS);
    if (!storageKey) return;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) setFiltersState(sanitizeFilters(JSON.parse(saved)));
    } catch {
      // unreadable: start with no filters
    }
  }, [storageKey]);

  const setFilters = useCallback(
    (next: Filters | ((prev: Filters) => Filters)) => {
      setFiltersState((prev) => {
        const value = sanitizeFilters(typeof next === "function" ? next(prev) : next);
        if (storageKey) {
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(value));
          } catch {
            // not remembered, still applies now
          }
        }
        return value;
      });
    },
    [storageKey]
  );

  useEffect(() => {
    setViews([]);
    if (!supabase || !userId) return;
    let cancelled = false;
    void supabase
      .from("saved_views")
      .select("id, name, filters, created_at")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn("EPCMst: could not load saved views.", error);
          setViewsAvailable(false);
          return;
        }
        setViewsAvailable(true);
        setViews(((data ?? []) as ViewRow[]).map((r) => ({ id: r.id, name: r.name, filters: sanitizeFilters(r.filters), createdAt: new Date(r.created_at).getTime() })));
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const saveView = useCallback(
    async (rawName: string) => {
      const name = rawName.trim().slice(0, 60);
      if (!name || !supabase || !userId) return false;
      const current = filtersRef.current;
      const { data, error } = await supabase
        .from("saved_views")
        .upsert({ user_id: userId, name, filters: current }, { onConflict: "user_id,name" })
        .select("id, name, filters, created_at")
        .single();
      if (error || !data) {
        console.warn("EPCMst: failed to save view.", error);
        toast.push({ message: "Couldn't save that view. Try again in a moment." });
        return false;
      }
      const saved: SavedView = { id: data.id, name: data.name, filters: sanitizeFilters(data.filters), createdAt: new Date(data.created_at).getTime() };
      setViews((all) => [...all.filter((v) => v.id !== saved.id && v.name !== saved.name), saved]);
      return true;
    },
    [supabase, userId, toast]
  );

  const deleteView = useCallback(
    (id: string) => {
      const removed = views.find((v) => v.id === id);
      if (!removed || !supabase) return;
      setViews((all) => all.filter((v) => v.id !== id));
      void supabase
        .from("saved_views")
        .delete()
        .eq("id", id)
        .then(({ error }) => {
          if (!error) return;
          console.warn("EPCMst: failed to delete view.", error);
          setViews((all) => [...all, removed]);
        });
    },
    [supabase, views]
  );

  const matchesWith = useCallback((o: Opportunity, f: Filters) => leadMatches(o, f, { scoreOf, previousVisit }), [scoreOf, previousVisit]);

  const value = useMemo<FiltersValue>(
    () => ({
      filters,
      setFilters,
      clear: () => setFilters(NO_FILTERS),
      activeCount: countActive(filters),
      hasPreviousVisit: Boolean(previousVisit),
      matches: (o) => matchesWith(o, filters),
      matchesWith,
      views,
      viewsAvailable,
      saveView,
      deleteView,
      applyView: (view) => setFilters(view.filters),
    }),
    [filters, setFilters, previousVisit, matchesWith, views, viewsAvailable, saveView, deleteView]
  );

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error("useFilters must be used inside <FiltersProvider>");
  return ctx;
}
