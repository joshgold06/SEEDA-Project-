"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Breadcrumbs, TopBar } from "@/components/ui";
import { type ThemePreference, useTheme } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; hint: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", hint: "Bright and clean, best in daylight.", icon: Sun },
  { value: "dark", label: "Dark", hint: "Easier on the eyes in low light.", icon: Moon },
  { value: "system", label: "System", hint: "Match your device and switch automatically.", icon: Monitor },
];

// Miniature of each theme, drawn with fixed colours so every card shows its own look
// regardless of which theme is active right now.
function Preview({ mode }: { mode: "light" | "dark" | "system" }) {
  const swatch = (m: "light" | "dark") =>
    m === "light"
      ? { page: "#f6f8fb", card: "#ffffff", line: "#e5e7eb", text: "#111111", accent: "#0e75bb", rail: "#0f2238" }
      : { page: "#0c1522", card: "#152134", line: "#27384f", text: "#e8edf5", accent: "#2d8bd0", rail: "#08111d" };
  const half = (m: "light" | "dark") => {
    const c = swatch(m);
    return (
      <div className="flex h-full flex-1" style={{ background: c.page }}>
        <div className="w-3" style={{ background: c.rail }} />
        <div className="flex-1 space-y-1.5 p-2">
          <div className="h-1.5 w-8 rounded-full" style={{ background: c.text, opacity: 0.8 }} />
          <div className="rounded p-1.5" style={{ background: c.card, border: `1px solid ${c.line}` }}>
            <div className="h-1 w-10 rounded-full" style={{ background: c.text, opacity: 0.5 }} />
            <div className="mt-1 h-1 w-6 rounded-full" style={{ background: c.accent }} />
          </div>
        </div>
      </div>
    );
  };
  return (
    <div className="flex h-[74px] overflow-hidden rounded-md border border-line">
      {mode === "system" ? <>{half("light")}{half("dark")}</> : half(mode)}
    </div>
  );
}

export default function SettingsPage() {
  const { preference, resolved, setPreference } = useTheme();

  return (
    <main className="min-w-0 flex-1">
      <TopBar left={<Breadcrumbs items={[{ label: "Settings" }]} />} />
      <div className="mx-auto w-full max-w-[640px] px-8 py-12">
        <section>
          <h1 className="text-[20px] font-bold">Appearance</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">
            Choose how EPCMst looks. The change applies right away and is remembered on this device.
          </p>

          <div role="radiogroup" aria-label="Theme" className="mt-6 grid gap-3 sm:grid-cols-3">
            {OPTIONS.map(({ value, label, hint, icon: Icon }) => {
              const selected = preference === value;
              return (
                <button
                  key={value}
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPreference(value)}
                  className={`rounded-lg border bg-surface p-3 text-left transition-all ${selected ? "border-brand ring-2 ring-brand/30" : "border-line hover:border-neutral-300"}`}
                >
                  <Preview mode={value} />
                  <div className="mt-3 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold"><Icon className="size-3.5 text-neutral-500" />{label}</span>
                    {selected && <span className="grid size-4 place-items-center rounded-full bg-brand text-white"><Check className="size-2.5" strokeWidth={3} /></span>}
                  </div>
                  <p className="mt-1 text-[11.5px] leading-snug text-neutral-500">{hint}</p>
                </button>
              );
            })}
          </div>

          <p className="mt-4 text-[12px] text-neutral-500" aria-live="polite">
            Showing the {resolved} theme{preference === "system" ? " because your device is set to it" : ""}.
          </p>
        </section>
      </div>
    </main>
  );
}
