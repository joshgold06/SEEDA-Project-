"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Opportunity, Stage } from "./data";
import { Draft, generateDraft } from "./outreach";
import { useAuth } from "./AuthContext";
import { ensureOrganizations } from "./leads/organizations";
import { createClient, isSupabaseConfigured } from "./supabase/client";
import {
  actionToRow,
  draftToRow,
  LEAD_SELECT,
  opportunityToRow,
  OWNER_NOT_NAMED,
  rowToDraft,
  rowToOpportunity,
  type LeadActionRow,
  type OpportunityRow,
} from "./supabase/mappers";

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
// The only fields a person changes about a lead; they are saved to lead_actions, not to the lead.
const ACTION_KEYS: (keyof Opportunity)[] = ["stage", "watched", "dismissed"];

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { profile, user } = useAuth();
  const senderName = profile?.name ?? "the SEEDA team";
  const userId = user?.id ?? null;

  const [state, setState] = useState<State>(EMPTY_STATE);
  const [loaded, setLoaded] = useState(false);
  // Refs let the save functions see the latest state and user without being re-created on every change.
  const stateRef = useRef(state);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  // Supabase is lazily created once per provider instance rather than per call.
  const supabase = useRef(isSupabaseConfigured ? createClient() : null).current;

  const commit = useCallback((next: State) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const loadFromSupabase = useCallback(async () => {
    if (!supabase) {
      setLoaded(true);
      return;
    }
    if (!userIdRef.current) return;
    try {
      const [leads, actions, drafts] = await Promise.all([
        supabase.from("opportunities").select(LEAD_SELECT).order("score", { ascending: false }),
        supabase.from("lead_actions").select("opportunity_id, stage, watched, dismissed, updated_at"),
        supabase.from("outreach_drafts").select("*"),
      ]);
      const failure = leads.error ?? actions.error ?? drafts.error;
      if (failure) throw failure;

      const actionById = new Map((actions.data as LeadActionRow[]).map((a) => [a.opportunity_id, a]));
      const draftMap: Record<string, Draft> = {};
      for (const row of drafts.data ?? []) draftMap[row.opportunity_id] = rowToDraft(row);
      commit({
        opportunities: (leads.data as unknown as OpportunityRow[]).map((row) => rowToOpportunity(row, actionById.get(row.id))),
        drafts: draftMap,
      });
    } catch (err) {
      console.warn("EPCMst: could not load from Supabase.", err);
    } finally {
      setLoaded(true);
    }
  }, [supabase, commit]);

  // Start empty and reload whenever a different person signs in or out, so one
  // person's leads, choices and drafts are never shown to the next.
  useEffect(() => {
    commit(EMPTY_STATE);
    setLoaded(false);
    void loadFromSupabase();
  }, [userId, loadFromSupabase, commit]);

  const saveAction = useCallback(
    (opp: Opportunity) => {
      const uid = userIdRef.current;
      if (!supabase || !uid) return;
      supabase
        .from("lead_actions")
        .upsert(actionToRow(uid, opp.id, opp), { onConflict: "user_id,opportunity_id" })
        .then(({ error }) => error && console.warn("EPCMst: failed to save your choice.", error));
    },
    [supabase]
  );

  const update = useCallback(
    (id: string, patch: Partial<Opportunity>) => {
      const current = stateRef.current.opportunities.find((o) => o.id === id);
      if (!current) return;
      const merged = { ...current, ...patch };
      commit({ ...stateRef.current, opportunities: stateRef.current.opportunities.map((o) => (o.id === id ? merged : o)) });
      if (ACTION_KEYS.some((k) => k in patch)) saveAction(merged);
    },
    [commit, saveAction]
  );

  const addLead = useCallback(
    (lead: Opportunity) => {
      commit({ ...stateRef.current, opportunities: [...stateRef.current.opportunities, lead] });
      const uid = userIdRef.current;
      if (!supabase || !uid) return;
      void (async () => {
        try {
          const named = lead.owner && lead.owner !== OWNER_NOT_NAMED && lead.owner !== "Unknown owner";
          const orgIds = named ? await ensureOrganizations(supabase, [{ name: lead.owner, owner_type: "Unclear" }]) : new Map<string, string>();
          const { error } = await supabase
            .from("opportunities")
            .insert(opportunityToRow(lead, { discoveredBy: uid, organizationId: orgIds.get(lead.owner) ?? null }));
          if (error) throw error;
          if (lead.stage) saveAction(lead);
        } catch (err) {
          console.warn("EPCMst: failed to save new lead.", err);
        }
      })();
    },
    [supabase, commit, saveAction]
  );

  const saveDraft = useCallback(
    (id: string, draft: Draft) => {
      commit({ ...stateRef.current, drafts: { ...stateRef.current.drafts, [id]: draft } });
      const uid = userIdRef.current;
      if (!supabase || !uid) return;
      supabase
        .from("outreach_drafts")
        .upsert(draftToRow(uid, id, draft), { onConflict: "user_id,opportunity_id" })
        .then(({ error }) => error && console.warn("EPCMst: failed to save draft.", error));
    },
    [supabase, commit]
  );

  const store = useMemo<Store>(
    () => ({
      ...state,
      loaded,
      get: (id) => state.opportunities.find((o) => o.id === id),
      update,
      setStage: (id, stage) => update(id, { stage }),
      addLead,
      saveDraft,
      getDraft: (id) => state.drafts[id] ?? generateDraft(state.opportunities.find((o) => o.id === id)!, senderName),
      reset: () => void loadFromSupabase(),
    }),
    [state, loaded, update, addLead, saveDraft, loadFromSupabase, senderName]
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
