"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { CountUp } from "@/components/CountUp";
import { DiscoverPanel } from "@/components/DiscoverPanel";
import { EpcmstMark } from "@/components/EpcmstLogo";
import { TunePanel } from "@/components/TunePanel";
import { Breadcrumbs, TopBar } from "@/components/ui";
import { useAuth } from "@/lib/AuthContext";
import { getPreviousVisit, isNewSince } from "@/lib/lastVisit";
import { useStore } from "@/lib/store";
import { useAutoRefresh } from "@/lib/useAutoRefresh";
import { useWeights } from "@/lib/weights";

const formatMoney = (n: number) => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${Math.round(n / 1e6)}M` : n > 0 ? `$${Math.round(n / 1000)}k` : "$0");
const sinceLabel = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });

export default function ScanHome() {
  const { opportunities, loaded } = useStore();
  const { profile, user } = useAuth();
  const { scoreOf } = useWeights();

  const signals = opportunities.filter((o) => o.inScan && !o.dismissed);
  const refresh = useAutoRefresh(signals.length);
  const previousVisit = user ? getPreviousVisit(user.id) : null;
  const newCount = signals.filter((o) => isNewSince(o.createdAt, previousVisit)).length;
  const top = [...signals].sort((a, b) => scoreOf(b) - scoreOf(a))[0];
  // The largest single figure, not a sum: one project is often reported by several outlets.
  // Figures above $50B are usually regional or industry totals ("energy projects pass $100B"), not one project.
  const biggest = signals.reduce<(typeof signals)[number] | undefined>((best, o) => ((o.value ?? 0) <= 50e9 && (o.value ?? 0) > (best?.value ?? 0) ? o : best), undefined);

  const summary = !loaded
    ? "Loading your leads…"
    : signals.length === 0
      ? refresh.running
        ? "Scanning public news for major projects. Leads appear here as each search finishes."
        : "No leads yet. Run a search below to pull in real projects from public news."
      : `${signals.length} project signal${signals.length === 1 ? "" : "s"} across Alberta, BC and Saskatchewan. Pick one from the list to start triaging.`;

  const stats = [
    {
      label: "Top match",
      value: top ? <><CountUp value={scoreOf(top)} /><span className="text-[14px] font-medium text-white/60"> / 100</span></> : "-",
      note: top ? (top.title.length > 58 ? `${top.title.slice(0, 57)}…` : top.title) : "No leads yet",
    },
    {
      label: "New since last visit",
      value: <CountUp value={previousVisit ? newCount : signals.length} />,
      note: previousVisit ? `since ${sinceLabel(previousVisit)}` : "First visit: everything is new to you",
    },
    {
      label: "Largest project",
      value: biggest?.value ? <CountUp value={biggest.value} format={formatMoney} /> : "-",
      note: biggest ? (biggest.title.length > 58 ? `${biggest.title.slice(0, 57)}…` : biggest.title) : "No values stated yet",
    },
  ];

  return (
    <>
      <TopBar left={<Breadcrumbs items={[{ label: "Western Canada" }, { label: "Capital projects" }]} />} right={<></>} />
      <div className="mx-auto w-full max-w-[920px] px-8 py-8">
        <section className="rise-in overflow-hidden rounded-2xl bg-linear-to-br from-rail via-navy to-brand p-8 text-white shadow-md">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-white"><EpcmstMark className="size-7" /></span>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/70">Morning Scan</span>
          </div>
          <h1 className="mt-5 text-[30px] leading-tight font-bold">Good morning{profile?.firstName ? `, ${profile.firstName}` : ""}</h1>
          <p className="mt-2 max-w-[560px] text-[14px] leading-relaxed text-white/80">{summary}</p>

          <div className="mt-5 min-h-[34px]" aria-live="polite">
            {refresh.running ? (
              <div className="max-w-[420px]">
                <div className="flex items-center gap-2 text-[12px] text-white/85">
                  <Loader2 className="size-3.5 animate-spin" />
                  Scanning public news: search {Math.min(refresh.done + 1, refresh.total)} of {refresh.total}
                  {refresh.added > 0 && <span className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10.5px]">+{refresh.added} new</span>}
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${(refresh.done / refresh.total) * 100}%` }} />
                </div>
              </div>
            ) : (
              loaded && (
                <div className="flex flex-wrap items-center gap-3 text-[12px] text-white/80">
                  {refresh.finished && (refresh.added > 0 || !refresh.error) && <span>{refresh.added > 0 ? `Scan finished: ${refresh.added} new lead${refresh.added === 1 ? "" : "s"} found.` : "Scan finished: nothing new since the last one."}</span>}
                  {refresh.error && <span className="text-amber-200">Some searches failed: {refresh.error}</span>}
                  <button onClick={() => refresh.refresh()} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 font-medium text-white transition-colors hover:bg-white/25">
                    <RefreshCw className="size-3" />
                    Scan all searches now
                  </button>
                </div>
              )
            )}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
                <div className="font-mono text-[11px] uppercase tracking-wider text-white/65">{s.label}</div>
                {loaded ? (
                  <>
                    <div className="mt-1.5 font-mono text-[24px] leading-none font-bold">{s.value}</div>
                    <p className="mt-2 truncate text-[11.5px] text-white/65">{s.note}</p>
                  </>
                ) : (
                  <div className="mt-2 animate-pulse space-y-2"><div className="h-6 w-16 rounded bg-white/20" /><div className="h-2.5 w-3/4 rounded bg-white/10" /></div>
                )}
              </div>
            ))}
          </div>
        </section>

        <TunePanel />
        <DiscoverPanel locked={refresh.running} />
      </div>
    </>
  );
}
