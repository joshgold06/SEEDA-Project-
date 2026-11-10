"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import type { Opportunity } from "./data";
import { ACTIVE_REGIONS, type Region } from "./leads/taxonomy";
import { ANGLES, DEFAULT_ANGLE, TONES, type AngleId, type Tone } from "./outreach";
import { createClient, isSupabaseConfigured } from "./supabase/client";

// Per-account settings: which kinds of lead to show and how old, default provinces and minimum score, and the
// outreach defaults (tone, pitch angle, signature, company line). They live in the user_settings table, one private
// row per person, so they follow the account to any device. Without that table the app still runs on the defaults.

export type SourceKey = "News" | "Regulatory" | "Permit" | "Tender";
export const SOURCE_KEYS: SourceKey[] = ["News", "Regulatory", "Permit", "Tender"];

export interface UserSettings {
  /** Which kinds of lead appear in the Morning Scan and on the Map. */
  sources: Record<SourceKey, boolean>;
  /** Leads published longer ago than this are hidden from the Morning Scan. Null means no limit. */
  maxAgeDays: number | null;
  /** The provinces and minimum score the list starts with when a person has not set filters of their own. */
  defaultRegions: Region[];
  defaultMinScore: number;
  outreach: { tone: Tone; angle: AngleId; signature: string; company: string };
}

export const AGE_CHOICES: (number | null)[] = [null, 30, 60, 90];
export const MIN_SCORE_CHOICES = [0, 50, 65];
export const SIGNATURE_MAX = 300;
export const COMPANY_MAX = 80;

export const DEFAULT_SETTINGS: UserSettings = {
  sources: { News: true, Regulatory: true, Permit: true, Tender: true },
  maxAgeDays: null,
  defaultRegions: [],
  defaultMinScore: 0,
  outreach: { tone: "Warm", angle: DEFAULT_ANGLE, signature: "", company: "" },
};

/** Reads settings from the database, keeping only values the app still knows about. */
export function sanitizeSettings(raw: unknown): UserSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (r.sources && typeof r.sources === "object" ? r.sources : {}) as Record<string, unknown>;
  const o = (r.outreach && typeof r.outreach === "object" ? r.outreach : {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").slice(0, max) : "");
  return {
    sources: Object.fromEntries(SOURCE_KEYS.map((k) => [k, s[k] !== false])) as Record<SourceKey, boolean>,
    maxAgeDays: AGE_CHOICES.includes(Number(r.maxAgeDays)) && r.maxAgeDays !== null ? Number(r.maxAgeDays) : null,
    defaultRegions: Array.isArray(r.defaultRegions) ? ACTIVE_REGIONS.filter((x) => (r.defaultRegions as unknown[]).includes(x)) : [],
    defaultMinScore: MIN_SCORE_CHOICES.includes(Number(r.defaultMinScore)) ? Number(r.defaultMinScore) : 0,
    outreach: {
      tone: TONES.includes(o.tone as Tone) ? (o.tone as Tone) : DEFAULT_SETTINGS.outreach.tone,
      angle: ANGLES.some((a) => a.id === o.angle) ? (o.angle as AngleId) : DEFAULT_SETTINGS.outreach.angle,
      signature: text(o.signature, SIGNATURE_MAX),
      company: text(o.company, COMPANY_MAX).replace(/\n/g, " "),
    },
  };
}

/** Whether a lead may appear in the Morning Scan and Map under a person's preferences. Shortlisted leads are never hidden here. */
export function leadAllowed(o: Pick<Opportunity, "type" | "publishedAt">, settings: UserSettings, now: Date = new Date()): boolean {
  if (o.type in settings.sources && !settings.sources[o.type as SourceKey]) return false;
  if (settings.maxAgeDays !== null && o.publishedAt) {
    const ageDays = (now.getTime() - new Date(o.publishedAt).getTime()) / 86_400_000;
    if (ageDays > settings.maxAgeDays) return false;
  }
  return true;
}

export type SaveState = "idle" | "saving" | "saved" | "error";

interface SettingsValue {
  settings: UserSettings;
  loaded: boolean;
  /** False when the user_settings table doesn't exist yet: changes then last only until the page is reloaded. */
  available: boolean;
  saveState: SaveState;
  update: (change: (current: UserSettings) => UserSettings) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsValue | null>(null);
const SAVE_DELAY_MS = 600;

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  // Whose settings have been read. "Loaded" means this person's own, never the defaults shown before sign-in finished,
  // so nothing that starts from a person's settings can run on the wrong ones.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loaded = loadedFor === (userId ?? "anonymous");
  const [available, setAvailable] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const supabase = useRef(isSupabaseConfigured ? createClient() : null).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(settings);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  // Each person gets their own row: start from the defaults and read it whenever a different person signs in or out.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    latest.current = DEFAULT_SETTINGS;
    setSettings(DEFAULT_SETTINGS);
    setSaveState("idle");
    if (!supabase || !userId) {
      setLoadedFor(userId ?? "anonymous");
      return;
    }
    let cancelled = false;
    void supabase
      .from("user_settings")
      .select("settings")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn("EPCMst: could not load settings.", error);
          setAvailable(false);
        } else {
          setAvailable(true);
          const next = sanitizeSettings(data?.settings);
          latest.current = next;
          setSettings(next);
        }
        setLoadedFor(userId);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  const save = useCallback(async () => {
    const uid = userIdRef.current;
    if (!supabase || !uid) return;
    setSaveState("saving");
    const { error } = await supabase.from("user_settings").upsert({ user_id: uid, settings: latest.current, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (userIdRef.current !== uid) return; // a different person signed in meanwhile
    if (error) {
      console.warn("EPCMst: failed to save settings.", error);
      setSaveState("error");
    } else setSaveState("saved");
  }, [supabase]);

  const update = useCallback(
    (change: (current: UserSettings) => UserSettings) => {
      const next = sanitizeSettings(change(latest.current));
      latest.current = next;
      setSettings(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), SAVE_DELAY_MS);
    },
    [save]
  );

  const reset = useCallback(() => update(() => DEFAULT_SETTINGS), [update]);

  const value = useMemo<SettingsValue>(() => ({ settings, loaded, available, saveState, update, reset }), [settings, loaded, available, saveState, update, reset]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
