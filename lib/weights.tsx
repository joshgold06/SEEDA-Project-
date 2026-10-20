"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Opportunity } from "./data";
import { adjustedScore, DEFAULT_WEIGHTS, type Weights } from "./scoring";

const STORAGE_KEY = "epcmst-score-weights-v1";

interface WeightsContextValue {
  weights: Weights;
  setWeights: (w: Weights) => void;
  setWeight: (key: keyof Weights, value: number) => void;
  reset: () => void;
  /** A lead's score under the current weights. */
  scoreOf: (o: Opportunity) => number;
}

const WeightsContext = createContext<WeightsContextValue | null>(null);

export function WeightsProvider({ children }: { children: React.ReactNode }) {
  const [weights, setWeightsState] = useState<Weights>(DEFAULT_WEIGHTS);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setWeightsState({ ...DEFAULT_WEIGHTS, ...JSON.parse(saved) });
    } catch {
      // storage unavailable or corrupt: keep the defaults
    }
  }, []);

  const setWeights = useCallback((w: Weights) => {
    setWeightsState(w);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
    } catch {
      // not persisted, still applies for this visit
    }
  }, []);

  const value = useMemo<WeightsContextValue>(
    () => ({
      weights,
      setWeights,
      setWeight: (key, v) => setWeights({ ...weights, [key]: v }),
      reset: () => setWeights(DEFAULT_WEIGHTS),
      scoreOf: (o) => adjustedScore(o, weights),
    }),
    [weights, setWeights]
  );

  return <WeightsContext.Provider value={value}>{children}</WeightsContext.Provider>;
}

export function useWeights() {
  const ctx = useContext(WeightsContext);
  if (!ctx) throw new Error("useWeights must be used inside <WeightsProvider>");
  return ctx;
}
