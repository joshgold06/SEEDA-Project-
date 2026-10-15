"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Opportunity, Stage } from "./data";
import { Draft, generateDraft } from "./outreach";
import { useAuth } from "./AuthContext";
import { createClient, isSupabaseConfigured } from "./supabase/client";
import { draftToRow, opportunityToRow, rowToDraft, rowToOpportunity } from "./supabase/mappers";

interface State {
  opportunities: Opportunity[];
  drafts: Record<string, Draft>;
}

interface Store extends State {
  loaded: boolean;
  get: (id: string) => Opportunity | undefined;
  update: (id: string, patch: Partial<Opportunity>) => void;
  setStage: (id: string, stage: Stage | null) => void;
  addLead: (lead: Opportunity) => void;
  saveDraft: (id: string, draft: Draft) => void;
  getDraft: (id: string) => Draft;
  reset: () => void;
}

const EMPTY_STATE: State = { opportunities: [], drafts: {} };

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const senderName = profile?.name ?? "the SEEDA team";
  const [state, setState] = useState<State>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  // Supabase is lazily created once per provider instance rather than per call.
  const supabase = useRef(isSupabaseConfigured ? createClient() : null).current;

  const loadFromSupabase = useCallback(async () => {
    if (!supabase) {
      setLoaded(true);
      return;
    }
    try {
      const [{ data: oppRows, error: oppError }, { data: draftRows, error: draftError }] = await Promise.all([
        supabase.from("opportunities").select("*").order("score", { ascending: false }),
        supabase.from("outreach_drafts").select("*"),
      ]);
      if (oppError) throw oppError;
      if (draftError) throw draftError;
      const drafts: Record<string, Draft> = {};
      for (const row of draftRows ?? []) drafts[row.opportunity_id] = rowToDraft(row);
      setState({ opportunities: (oppRows ?? []).map(rowToOpportunity), drafts });
    } catch (err) {
      console.warn("Signal Scout: could not load from Supabase.", err);
    } finally {
      setLoaded(true);
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
      loaded,
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
      getDraft: (id) => state.drafts[id] ?? generateDraft(state.opportunities.find((o) => o.id === id)!, senderName),
      reset: () => loadFromSupabase(),
    }),
    [state, loaded, update, supabase, loadFromSupabase, senderName]
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
