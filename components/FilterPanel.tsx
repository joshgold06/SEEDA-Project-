"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, SlidersHorizontal, X } from "lucide-react";
import type { Opportunity } from "@/lib/data";
import { countActive, industriesOf, SCORE_CHOICES, SIGNAL_CHOICES, useFilters, type Filters, type SavedView } from "@/lib/filters";
import { regionOf } from "@/lib/leads/geo";
import { ACTIVE_REGIONS, INDUSTRIES, REGION_SHORT } from "@/lib/leads/taxonomy";

const sameFilters = (a: Filters, b: Filters) => JSON.stringify(a) === JSON.stringify(b);
const toggle = <T,>(items: T[], item: T) => (items.includes(item) ? items.filter((i) => i !== item) : [...items, item]);

function Chip({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-[27px] items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-colors ${active ? "border-action bg-action text-white" : "border-line bg-surface text-ink hover:bg-neutral-50"} ${!active && count === 0 ? "opacity-45" : ""}`}
    >
      {label}
      {count !== undefined && <span className={`font-mono text-[10.5px] ${active ? "text-white/75" : "text-neutral-400"}`}>{count}</span>}
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <h3 className="label !text-[10px]">{title}</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/**
 * The organizer's panel. `leads` is the set of leads the filters apply to, used to show how many
 * leads each choice would give (counted with the other filters already applied).
 */
export function FilterButton({ leads, align = "left", panelWidth = 310 }: { leads: Opportunity[]; align?: "left" | "right"; panelWidth?: number }) {
  const { filters, setFilters, clear, activeCount, hasPreviousVisit, matchesWith, views, viewsAvailable, saveView, deleteView, applyView } = useFilters();
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState("");
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Each choice is counted against the leads that pass every OTHER filter, so the numbers show what a click would give.
  const counts = useMemo(() => {
    const regions = new Map<string, number>();
    const industries = new Map<string, number>();
    const signals = new Map<string, number>();
    for (const o of leads) {
      if (matchesWith(o, { ...filters, regions: [] })) {
        const r = regionOf(o);
        if (r) regions.set(r, (regions.get(r) ?? 0) + 1);
      }
      if (matchesWith(o, { ...filters, industries: [] })) for (const i of industriesOf(o)) industries.set(i, (industries.get(i) ?? 0) + 1);
      if (matchesWith(o, { ...filters, signals: [] })) signals.set(o.phaseTag, (signals.get(o.phaseTag) ?? 0) + 1);
    }
    return { regions, industries, signals, shown: leads.filter((o) => matchesWith(o, filters)).length };
  }, [leads, filters, matchesWith]);

  const set = (patch: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...patch }));

  const submitView = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!naming.trim() || saving) return;
    setSaving(true);
    const ok = await saveView(naming);
    setSaving(false);
    if (ok) setNaming("");
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`inline-flex h-[28px] items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors ${activeCount ? "border-brand bg-brand-soft text-brand-dark" : "border-line bg-surface text-ink hover:bg-neutral-50"}`}
      >
        <SlidersHorizontal className="size-3.5" />
        Filters
        {activeCount > 0 && <span className="grid size-[17px] place-items-center rounded-full bg-brand text-[10px] text-white">{activeCount}</span>}
      </button>

      {open && (
        <div role="dialog" aria-label="Filters" style={{ width: panelWidth }} className={`rise-in absolute top-full z-40 mt-2 max-h-[78vh] max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border border-line bg-surface p-4 text-left shadow-xl ${align === "right" ? "right-0" : "left-0"}`}>
          <div className="mb-4 border-b border-line pb-4">
            <h3 className="label !text-[10px]">Saved views</h3>
            {views.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {views.map((v: SavedView) => {
                  const current = sameFilters(v.filters, filters);
                  return (
                    <li key={v.id} className={`inline-flex h-[27px] items-center overflow-hidden rounded-full border text-[12px] font-medium ${current ? "border-brand bg-brand-soft text-brand-dark" : "border-line bg-surface"}`}>
                      <button onClick={() => applyView(v)} className="inline-flex h-full items-center gap-1.5 pr-1.5 pl-2.5 hover:bg-neutral-50" title={`Apply "${v.name}"`}>
                        <Bookmark className="size-3 text-brand" />
                        {v.name}
                      </button>
                      <button onClick={() => deleteView(v.id)} aria-label={`Delete the view ${v.name}`} className="grid h-full w-6 place-items-center text-neutral-400 hover:bg-neutral-100 hover:text-red-600"><X className="size-3" /></button>
                    </li>
                  );
                })}
              </ul>
            )}
            {!viewsAvailable ? (
              <p className="mt-2 text-[11.5px] text-neutral-500">Saved views aren&rsquo;t available right now.</p>
            ) : (
              <form onSubmit={submitView} className="mt-2 flex gap-1.5">
                <input
                  value={naming}
                  onChange={(e) => setNaming(e.target.value)}
                  maxLength={60}
                  placeholder={activeCount ? "Name these filters to save them" : "Pick some filters, then name them"}
                  aria-label="Name for the saved view"
                  className="h-[30px] min-w-0 flex-1 rounded border border-line bg-surface px-2.5 text-[12px] outline-none focus:border-brand"
                />
                <button type="submit" disabled={!naming.trim() || activeCount === 0 || saving} className="h-[30px] rounded bg-action px-3 text-[12px] font-medium text-white hover:bg-action-hover disabled:opacity-40">{saving ? "Saving…" : "Save"}</button>
              </form>
            )}
            {views.length === 0 && viewsAvailable && <p className="mt-1.5 text-[11px] text-neutral-500">A saved view brings back this exact set of filters in one click.</p>}
          </div>

          <Group title="Industry">
            {INDUSTRIES.map((i) => <Chip key={i} label={i} count={counts.industries.get(i) ?? 0} active={filters.industries.includes(i)} onClick={() => set({ industries: toggle(filters.industries, i) })} />)}
          </Group>
          <Group title="Province">
            {ACTIVE_REGIONS.map((r) => <Chip key={r} label={REGION_SHORT[r]} count={counts.regions.get(r) ?? 0} active={filters.regions.includes(r)} onClick={() => set({ regions: toggle(filters.regions, r) })} />)}
          </Group>
          <Group title="Signal">
            {SIGNAL_CHOICES.map((s) => <Chip key={s} label={s} count={counts.signals.get(s) ?? 0} active={filters.signals.includes(s)} onClick={() => set({ signals: toggle(filters.signals, s) })} />)}
          </Group>
          <Group title="Minimum score">
            {SCORE_CHOICES.map((n) => <Chip key={n} label={n === 0 ? "Any" : `${n}+`} active={filters.minScore === n} onClick={() => set({ minScore: n })} />)}
          </Group>
          <Group title="Only show">
            <Chip label="Contractor named" active={filters.contractorOnly} onClick={() => set({ contractorOnly: !filters.contractorOnly })} />
            <Chip label="Watching" active={filters.watchedOnly} onClick={() => set({ watchedOnly: !filters.watchedOnly })} />
            <span title={hasPreviousVisit ? "Only leads added since your last visit" : "Available after your second visit"} className={hasPreviousVisit ? "" : "opacity-50"}>
              <Chip label="New since last visit" active={filters.newOnly} onClick={() => hasPreviousVisit && set({ newOnly: !filters.newOnly })} />
            </span>
          </Group>

          <div className="mt-5 flex items-center justify-between border-t border-line pt-3 text-[12px]">
            <span className="text-neutral-500" aria-live="polite">Showing <strong className="font-mono text-ink">{counts.shown}</strong> of {leads.length}</span>
            <button onClick={clear} disabled={activeCount === 0} className="font-medium text-brand hover:underline disabled:text-neutral-400 disabled:no-underline">Clear all</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The filters that are on, as chips that can be taken off one at a time. */
export function ActiveFilterChips({ className = "" }: { className?: string }) {
  const { filters, setFilters, clear } = useFilters();
  const chips: { key: string; label: string; remove: () => void }[] = [
    ...filters.industries.map((i) => ({ key: `i-${i}`, label: i, remove: () => setFilters((f) => ({ ...f, industries: f.industries.filter((x) => x !== i) })) })),
    ...filters.regions.map((r) => ({ key: `r-${r}`, label: REGION_SHORT[r], remove: () => setFilters((f) => ({ ...f, regions: f.regions.filter((x) => x !== r) })) })),
    ...filters.signals.map((s) => ({ key: `s-${s}`, label: s, remove: () => setFilters((f) => ({ ...f, signals: f.signals.filter((x) => x !== s) })) })),
    ...(filters.minScore ? [{ key: "score", label: `Score ${filters.minScore}+`, remove: () => setFilters((f) => ({ ...f, minScore: 0 })) }] : []),
    ...(filters.contractorOnly ? [{ key: "contractor", label: "Contractor named", remove: () => setFilters((f) => ({ ...f, contractorOnly: false })) }] : []),
    ...(filters.watchedOnly ? [{ key: "watched", label: "Watching", remove: () => setFilters((f) => ({ ...f, watchedOnly: false })) }] : []),
    ...(filters.newOnly ? [{ key: "new", label: "New", remove: () => setFilters((f) => ({ ...f, newOnly: false })) }] : []),
  ];
  if (chips.length === 0) return null;
  return (
    <ul className={`flex flex-wrap items-center gap-1.5 ${className}`} aria-label="Active filters">
      {chips.map((c) => (
        <li key={c.key} className="inline-flex h-[22px] items-center gap-1 rounded-full border border-brand-line bg-brand-soft pr-1 pl-2 text-[11px] font-medium text-brand-dark">
          {c.label}
          <button onClick={c.remove} aria-label={`Remove filter ${c.label}`} className="grid size-4 place-items-center rounded-full hover:bg-brand-line/60"><X className="size-2.5" /></button>
        </li>
      ))}
      {countActive(filters) > 1 && <li><button onClick={clear} className="text-[11px] font-medium text-neutral-500 hover:text-ink hover:underline">Clear</button></li>}
    </ul>
  );
}
