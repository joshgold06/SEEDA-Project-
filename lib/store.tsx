"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Opportunity, SEED_OPPORTUNITIES, Stage } from "./data";
import { Draft, generateDraft } from "./outreach";
import { createClient, isSupabaseConfigured } from "./supabase/client";
import { draftToRow, opportunityToRow, rowToDraft, rowToOpportunity } from "./supabase/mappers";

interface State {
  opportunities: Opportunity[];
  drafts: Record<string, Draft>;
}

interface Store extends State {
  get: (id: string) => Opportunity | undefined;
  update: (id: string, patch: Partial<Opportunity>) => void;
  setStage: (id: string, stage: Stage | null) => void;
  addLead: (lead: Opportunity) => void;
  saveDraft: (id: string, draft: Draft) => void;
  getDraft: (id: string) => Draft;
  reset: () => void;
}

function seedState(): State {
  const bow = SEED_OPPORTUNITIES.find((o) => o.id === "bow-river-wtp")!;
  return { opportunities: SEED_OPPORTUNITIES, drafts: { [bow.id]: { ...generateDraft(bow), updatedAt: Date.now() - 120000 } } };
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(seedState);
  // Supabase is lazily created once per provider instance rather than per call.
  const supabase = useRef(isSupabaseConfigured ? createClient() : null).current;

  const loadFromSupabase = useCallback(async () => {
    if (!supabase) return;
    try {
      const [{ data: oppRows, error: oppError }, { data: draftRows, error: draftError }] = await Promise.all([
        supabase.from("opportunities").select("*").order("score", { ascending: false }),
        supabase.from("outreach_drafts").select("*"),
      ]);
      if (oppError) throw oppError;
      if (draftError) throw draftError;
      if (!oppRows || oppRows.length === 0) return; // migration/seed not run yet — keep local seed data
      const drafts: Record<string, Draft> = {};
      for (const row of draftRows ?? []) drafts[row.opportunity_id] = rowToDraft(row);
      setState({ opportunities: oppRows.map(rowToOpportunity), drafts });
    } catch (err) {
      console.warn("Signal Scout: could not load from Supabase, using local seed data.", err);
    }
  }, [supabase]);

  useEffect(() => {
    loadFromSupabase();
  }, [loadFromSupabase]);

  const update = useCallback(
    (id: string, patch: Partial<Opportunity>) => {
      setState((s) => {
        const next = s.opportunities.map((o) => (o.id === id ? { ...o, ...patch } : o));
        const updated = next.find((o) => o.id === id);
        if (updated && supabase) {
          supabase
            .from("opportunities")
            .upsert(opportunityToRow(updated))
            .then(({ error }) => error && console.warn("Signal Scout: failed to save opportunity.", error));
        }
        return { ...s, opportunities: next };
      });
    },
    [supabase]
  );

  const store = useMemo<Store>(
    () => ({
      ...state,
      get: (id) => state.opportunities.find((o) => o.id === id),
      update,
      setStage: (id, stage) => update(id, { stage }),
      addLead: (lead) => {
        setState((s) => ({ ...s, opportunities: [...s.opportunities, lead] }));
        if (supabase) {
          supabase
            .from("opportunities")
            .insert(opportunityToRow(lead))
            .then(({ error }) => error && console.warn("Signal Scout: failed to save new lead.", error));
        }
      },
      saveDraft: (id, draft) => {
        setState((s) => ({ ...s, drafts: { ...s.drafts, [id]: draft } }));
        if (supabase) {
          supabase
            .from("outreach_drafts")
            .upsert(draftToRow(id, draft))
            .then(({ error }) => error && console.warn("Signal Scout: failed to save draft.", error));
        }
      },
      getDraft: (id) => state.drafts[id] ?? generateDraft(state.opportunities.find((o) => o.id === id)!),
      reset: () => loadFromSupabase(),
    }),
    [state, update, supabase, loadFromSupabase]
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
