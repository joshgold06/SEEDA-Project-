"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Monitor, Moon, Sun, TriangleAlert } from "lucide-react";
import { Breadcrumbs, Button, TopBar } from "@/components/ui";
import { useAuth } from "@/lib/AuthContext";
import { NO_FILTERS, useFilters } from "@/lib/filters";
import { ACTIVE_REGIONS, REGION_SHORT } from "@/lib/leads/taxonomy";
import { DAILY_LIMITS } from "@/lib/limits";
import { ANGLES, TONES, type AngleId, type Tone } from "@/lib/outreach";
import { AGE_CHOICES, COMPANY_MAX, MIN_SCORE_CHOICES, SIGNATURE_MAX, SOURCE_KEYS, useSettings, type SourceKey } from "@/lib/settings";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { type ThemePreference, useTheme } from "@/lib/theme";

const OPTIONS: { value: ThemePreference; label: string; hint: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", hint: "Bright and clean, best in daylight.", icon: Sun },
  { value: "dark", label: "Dark", hint: "Easier on the eyes in low light.", icon: Moon },
  { value: "system", label: "System", hint: "Match your device and switch automatically.", icon: Monitor },
];

const SOURCES: Record<SourceKey, { label: string; hint: string }> = {
  News: { label: "News", hint: "Headlines about projects from public news." },
  Regulatory: { label: "Government assessments", hint: "Federal and BC environmental assessments, which name the owner." },
  Permit: { label: "Building permits", hint: "Calgary and Edmonton permits, which sometimes name the contractor." },
  Tender: { label: "Federal tenders", hint: "CanadaBuys notices. These are public work, so they rank lowest." },
};

const AGE_LABEL = (days: number | null) => (days === null ? "No limit" : `${days} days`);
const SCORE_LABEL = (n: number) => (n === 0 ? "Any score" : `${n}+`);

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

function Section({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-9 first:border-t-0 first:pt-0">
      <h2 className="text-[20px] font-bold">{title}</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">{intro}</p>
      <div className="mt-6 space-y-7">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[13px] font-semibold">{label}</div>
      {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-neutral-500">{hint}</p>}
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

/** A row of choices of which exactly one is picked. */
function Segmented<T extends string | number | null>({ value, options, label, onChange }: { value: T; options: { value: T; label: string }[]; label: string; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1.5">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={`h-[30px] rounded-md border px-3 text-[12.5px] font-medium transition-colors ${selected ? "border-brand bg-brand-soft text-brand-dark" : "border-line bg-surface hover:bg-neutral-50"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function UsageRow({ label, used, limit }: { label: string; used: number | null; limit: number }) {
  const pct = used === null ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-[12px] text-neutral-600">{used === null ? "–" : used} of {limit}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used ?? 0}>
        <div className={`h-full rounded-full transition-all ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** How much of each daily allowance this person has used in the last 24 hours. Read from their own rows only. */
function useUsage() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<{ research: number; explain: number; email: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setUsage(null);
    setFailed(false);
    if (!isSupabaseConfigured || !user) return;
    const supabase = createClient();
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const aiCount = (kind: string) => supabase.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("kind", kind).gte("created_at", since);
    let cancelled = false;
    void Promise.all([
      supabase.from("lead_research").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("researched_at", since),
      aiCount("explain"),
      aiCount("email"),
    ]).then(([research, explain, email]) => {
      if (cancelled) return;
      if (research.error || explain.error || email.error) setFailed(true);
      else setUsage({ research: research.count ?? 0, explain: explain.count ?? 0, email: email.count ?? 0 });
    });
    return () => {
      cancelled = true;
    };
  }, [user]);
  return { usage, failed };
}

export default function SettingsPage() {
  const { preference, resolved, setPreference } = useTheme();
  const { settings, update, reset, available, saveState, loaded } = useSettings();
  const { setFilters } = useFilters();
  const { usage, failed } = useUsage();
  const [applied, setApplied] = useState(false);
  const { outreach } = settings;

  const toggleRegion = (region: (typeof ACTIVE_REGIONS)[number]) =>
    update((s) => ({ ...s, defaultRegions: s.defaultRegions.includes(region) ? s.defaultRegions.filter((r) => r !== region) : [...s.defaultRegions, region] }));

  const applyNow = () => {
    setFilters({ ...NO_FILTERS, regions: settings.defaultRegions, minScore: settings.defaultMinScore });
    setApplied(true);
    setTimeout(() => setApplied(false), 2500);
  };

  return (
    <main className="min-w-0 flex-1">
      <TopBar
        left={<Breadcrumbs items={[{ label: "Settings" }]} />}
        right={
          <span className="flex items-center gap-1.5 text-[12px] text-neutral-500" aria-live="polite">
            {saveState === "saving" && <><Loader2 className="size-3.5 animate-spin" />Saving…</>}
            {saveState === "saved" && <><Check className="size-3.5 text-brand" />Saved to your account</>}
            {saveState === "error" && <span className="text-red-600">Couldn&apos;t save. Try again.</span>}
          </span>
        }
      />
      <div className="mx-auto w-full max-w-[680px] space-y-9 px-8 py-12">
        {!available && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[12.5px] leading-relaxed text-amber-950">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            Saving settings to your account needs a one-time database step that hasn&apos;t been done yet. Your changes work now but will be lost when you reload.
          </p>
        )}

        <Section title="Lead preferences" intro="Choose what shows up in your Morning Scan and on the Map. These are saved with your account, so they apply on any device, and other people keep their own.">
          <Field label="Show these kinds of lead" hint="Leads you have already shortlisted always stay in your shortlist and pipeline.">
            <div className="space-y-2">
              {SOURCE_KEYS.map((key) => (
                <label key={key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface p-3 hover:bg-neutral-50">
                  <input
                    type="checkbox"
                    checked={settings.sources[key]}
                    onChange={(e) => update((s) => ({ ...s, sources: { ...s.sources, [key]: e.target.checked } }))}
                    className="mt-0.5 size-4 accent-[var(--color-brand)]"
                  />
                  <span>
                    <span className="block text-[13px] font-semibold">{SOURCES[key].label}</span>
                    <span className="block text-[11.5px] leading-snug text-neutral-500">{SOURCES[key].hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>

          <Field label="Hide leads older than" hint="Based on the date each lead was published or recorded.">
            <Segmented label="Hide leads older than" value={settings.maxAgeDays} options={AGE_CHOICES.map((d) => ({ value: d, label: AGE_LABEL(d) }))} onChange={(v) => update((s) => ({ ...s, maxAgeDays: v }))} />
          </Field>

          <Field label="Start the list with these provinces" hint="Leave all unselected to see every province. Filters you set yourself on the list always win over this.">
            <div className="flex flex-wrap gap-1.5">
              {ACTIVE_REGIONS.map((region) => {
                const on = settings.defaultRegions.includes(region);
                return (
                  <button
                    key={region}
                    aria-pressed={on}
                    onClick={() => toggleRegion(region)}
                    className={`h-[30px] rounded-full border px-3 text-[12.5px] font-medium transition-colors ${on ? "border-brand bg-brand-soft text-brand-dark" : "border-line bg-surface hover:bg-neutral-50"}`}
                  >
                    {REGION_SHORT[region]}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Start the list at this minimum score">
            <Segmented label="Minimum score" value={settings.defaultMinScore} options={MIN_SCORE_CHOICES.map((n) => ({ value: n, label: SCORE_LABEL(n) }))} onChange={(v) => update((s) => ({ ...s, defaultMinScore: v }))} />
          </Field>

          <div className="flex items-center gap-3">
            <Button onClick={applyNow}>Use these provinces and score on the list now</Button>
            {applied && <span className="flex items-center gap-1 text-[12px] text-brand-dark"><Check className="size-3.5" />Applied</span>}
          </div>
        </Section>

        <Section title="Outreach defaults" intro="Where a new email draft starts. You can still change the tone and angle on any draft.">
          <Field label="Tone">
            <Segmented<Tone> label="Tone" value={outreach.tone} options={TONES.map((t) => ({ value: t, label: t }))} onChange={(tone) => update((s) => ({ ...s, outreach: { ...s.outreach, tone } }))} />
          </Field>

          <Field label="Pitch angle" hint="The one idea the message leads with.">
            <div role="radiogroup" aria-label="Pitch angle" className="grid gap-2 sm:grid-cols-2">
              {ANGLES.map((a) => {
                const selected = outreach.angle === a.id;
                return (
                  <button
                    key={a.id}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => update((s) => ({ ...s, outreach: { ...s.outreach, angle: a.id as AngleId } }))}
                    className={`rounded-lg border bg-surface p-3 text-left transition-all ${selected ? "border-brand ring-2 ring-brand/30" : "border-line hover:border-neutral-300"}`}
                  >
                    <span className="block text-[13px] font-semibold">{a.label}</span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-neutral-500">{a.blurb}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Signature" hint={`How your drafts end, under "Best,". Leave blank to sign with your name. Up to ${SIGNATURE_MAX} characters.`}>
            <textarea
              value={outreach.signature}
              onChange={(e) => update((s) => ({ ...s, outreach: { ...s.outreach, signature: e.target.value } }))}
              maxLength={SIGNATURE_MAX}
              rows={3}
              placeholder={"Josh Goldstein\nBusiness Development, SEEDA"}
              className="w-full rounded border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
            />
          </Field>

          <Field label="Company line" hint="Used when the AI writes a draft, so it knows who you write for. Leave blank for the default.">
            <input
              value={outreach.company}
              onChange={(e) => update((s) => ({ ...s, outreach: { ...s.outreach, company: e.target.value } }))}
              maxLength={COMPANY_MAX}
              placeholder="SEEDA (EPCMst network)"
              className="h-[34px] w-full rounded border border-line bg-surface px-3 text-[13px] outline-none focus:border-neutral-400"
            />
          </Field>
        </Section>

        <Section title="Usage today" intro="The AI and research features have a daily allowance per person, counted over the last 24 hours, to keep the free plans from running out.">
          {failed ? (
            <p className="text-[12.5px] text-neutral-500">Usage isn&apos;t available right now.</p>
          ) : (
            <div className="space-y-4">
              <UsageRow label="Research this lead" used={usage?.research ?? null} limit={DAILY_LIMITS.research} />
              <UsageRow label="AI summaries" used={usage?.explain ?? null} limit={DAILY_LIMITS.explain} />
              <UsageRow label="AI email drafts" used={usage?.email ?? null} limit={DAILY_LIMITS.email} />
            </div>
          )}
        </Section>

        <Section title="Appearance" intro="Choose how EPCMst looks. The change applies right away and is remembered on this device.">
          <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
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
          <p className="-mt-3 text-[12px] text-neutral-500" aria-live="polite">
            Showing the {resolved} theme{preference === "system" ? " because your device is set to it" : ""}.
          </p>
        </Section>

        <div className="border-t border-line pt-6">
          <Button onClick={reset} disabled={!loaded}>Reset lead and outreach settings to the defaults</Button>
        </div>
      </div>
    </main>
  );
}
