"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { THEME_STORAGE_KEY } from "./themeScript";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const systemPrefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
const resolve = (p: ThemePreference): ResolvedTheme => (p === "system" ? (systemPrefersDark() ? "dark" : "light") : p);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  const apply = useCallback((p: ThemePreference) => {
    const next = resolve(p);
    document.documentElement.dataset.theme = next;
    setResolved(next);
  }, []);

  useEffect(() => {
    let saved: ThemePreference = "system";
    try {
      const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") saved = raw;
    } catch {
      // storage unavailable: follow the system setting
    }
    setPreferenceState(saved);
    apply(saved);
  }, [apply]);

  // While following the system setting, react when the operating system switches.
  useEffect(() => {
    if (preference !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [preference, apply]);

  const setPreference = useCallback(
    (p: ThemePreference) => {
      setPreferenceState(p);
      apply(p);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, p);
      } catch {
        // not remembered after a reload, but still applies now
      }
    },
    [apply]
  );

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
