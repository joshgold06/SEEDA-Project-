"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MapPin, X } from "lucide-react";
import { LeadMap, tierColor, type PlaceGroup } from "@/components/LeadMap";
import { Breadcrumbs, Score, SectorIcon, TopBar } from "@/components/ui";
import { useAuth } from "@/lib/AuthContext";
import { getPreviousVisit, isNewSince } from "@/lib/lastVisit";
import { inLowerMainland, placeFor, type MapFocus } from "@/lib/leads/geo";
import { STAGES } from "@/lib/data";
import { useStore } from "@/lib/store";
import { useWeights } from "@/lib/weights";

const FOCUS_OPTIONS: { value: MapFocus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Alberta", label: "Alberta" },
  { value: "British Columbia", label: "BC" },
  { value: "Saskatchewan", label: "Saskatchewan" },
  { value: "Lower Mainland", label: "Vancouver area" },
];

const chip = (active: boolean) =>
  `h-[28px] rounded-full border px-3 text-[12px] font-medium transition-colors ${active ? "border-action bg-action text-white" : "border-line bg-surface text-ink hover:bg-neutral-50"}`;

export default function MapPage() {
  const { opportunities, loaded } = useStore();
  const { scoreOf } = useWeights();
  const { user } = useAuth();
  const [focus, setFocus] = useState<MapFocus>("all");
  const [minScore, setMinScore] = useState(0);
  const [newOnly, setNewOnly] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const previousVisit = user ? getPreviousVisit(user.id) : null;

  const { groups, leadCount, unmapped } = useMemo(() => {
    const byPlace = new Map<string, PlaceGroup>();
    let count = 0;
    let missing = 0;
    for (const o of opportunities) {
      if (!o.inScan || o.dismissed) continue;
      if (scoreOf(o) < minScore) continue;
      if (newOnly && !isNewSince(o.createdAt, previousVisit)) continue;
      const place = placeFor(o);
      if (!place) {
        missing++;
        continue;
      }
      if (focus === "Lower Mainland") {
        if (!inLowerMainland(place)) continue;
      } else if (focus !== "all" && place.region !== focus) continue;
      const group = byPlace.get(place.key) ?? { place, leads: [], topScore: 0 };
      group.leads.push(o);
      group.topScore = Math.max(group.topScore, scoreOf(o));
      byPlace.set(place.key, group);
      count++;
    }
    const list = [...byPlace.values()].sort((a, b) => b.leads.length - a.leads.length || b.topScore - a.topScore);
    list.forEach((g) => g.leads.sort((a, b) => scoreOf(b) - scoreOf(a)));
    return { groups: list, leadCount: count, unmapped: missing };
  }, [opportunities, scoreOf, minScore, newOnly, previousVisit, focus]);

  const selected = groups.find((g) => g.place.key === selectedKey) ?? null;
  const maxCount = Math.max(1, ...groups.map((g) => g.leads.length));

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TopBar left={<Breadcrumbs items={[{ label: "Western Canada" }, { label: "Map" }]} />} />

      <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Zoom to a province">
          {FOCUS_OPTIONS.map((o) => (
            <button key={o.value} onClick={() => { setFocus(o.value); setSelectedKey(null); }} aria-pressed={focus === o.value} className={chip(focus === o.value)}>{o.label}</button>
          ))}
        </div>
        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
        <label className="flex items-center gap-2 text-[12px] text-neutral-600">
          Min score
          <select value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="h-[28px] rounded border border-line bg-surface px-2 text-[12px] text-ink">
            <option value={0}>Any</option>
            <option value={50}>50+</option>
            <option value={65}>65+</option>
          </select>
        </label>
        <button
          onClick={() => setNewOnly((v) => !v)}
          disabled={!previousVisit}
          aria-pressed={newOnly}
          title={previousVisit ? "Only leads added since your last visit" : "Available after your second visit"}
          className={`${chip(newOnly)} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          New only
        </button>
        <span className="ml-auto text-[12px] text-neutral-500" aria-live="polite">
          {loaded ? `${leadCount} lead${leadCount === 1 ? "" : "s"} at ${groups.length} place${groups.length === 1 ? "" : "s"}` : "Loading…"}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6 lg:flex-row">
        <div className="min-h-[420px] flex-1">
          {loaded && groups.length === 0 ? (
            <div className="grid h-full min-h-[420px] place-items-center rounded-xl border border-dashed border-line text-center">
              <div className="max-w-xs px-6">
                <MapPin className="mx-auto size-7 text-neutral-300" />
                <p className="mt-3 text-[13px] text-neutral-500">No leads match these filters. Widen the score or province, or run a scan from the Morning Scan page.</p>
              </div>
            </div>
          ) : (
            <LeadMap groups={groups} focus={focus} selectedKey={selectedKey} highlightKey={hoverKey ?? selectedKey} onSelect={setSelectedKey} onHover={setHoverKey} />
          )}
        </div>

        <aside className="w-full shrink-0 lg:w-[330px]">
          {selected ? (
            <section className="rise-in rounded-xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-[14px] font-semibold">{selected.place.label}</h2>
                  <p className="text-[12px] text-neutral-500">{selected.place.region} · {selected.leads.length} lead{selected.leads.length === 1 ? "" : "s"}</p>
                </div>
                <button onClick={() => setSelectedKey(null)} aria-label="Close" className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-ink"><X className="size-4" /></button>
              </div>
              <ul className="mt-3 max-h-[52vh] space-y-2 overflow-y-auto pr-1">
                {selected.leads.map((o) => (
                  <li key={o.id}>
                    <Link href={`/scan/${o.id}`} className="block rounded-lg border border-line p-3 transition-colors hover:border-brand hover:bg-brand-soft/50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-neutral-500"><SectorIcon category={o.category} className="size-3" />{o.phaseTag}</span>
                        <Score value={scoreOf(o)} />
                      </div>
                      <p className="mt-1.5 text-[12.5px] leading-snug font-medium">{o.title}</p>
                      <p className="mt-1 text-[11px] text-neutral-500">
                        {o.owner}
                        {o.stage && <span className="ml-1.5 rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand-dark">{STAGES.find((s) => s.id === o.stage)?.label}</span>}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="rounded-xl border border-line bg-surface p-4">
              <h2 className="text-[14px] font-semibold">Where the signals are</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">Click a bubble, or a place below, to see its leads.</p>
              <ul className="mt-3 space-y-1">
                {groups.slice(0, 8).map((g) => (
                  <li key={g.place.key}>
                    <button
                      onClick={() => setSelectedKey(g.place.key)}
                      onMouseEnter={() => setHoverKey(g.place.key)}
                      onMouseLeave={() => setHoverKey(null)}
                      className="flex w-full items-center gap-3 rounded px-2 py-1.5 text-left text-[12.5px] hover:bg-neutral-50"
                    >
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: tierColor(g.topScore) }} />
                      <span className="min-w-0 flex-1 truncate">{g.place.label}</span>
                      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-neutral-100"><span className="block h-full rounded-full" style={{ width: `${(g.leads.length / maxCount) * 100}%`, background: tierColor(g.topScore) }} /></span>
                      <span className="w-5 text-right font-mono text-[11.5px] text-neutral-600">{g.leads.length}</span>
                    </button>
                  </li>
                ))}
                {groups.length === 0 && <li className="px-2 py-1.5 text-[12px] text-neutral-500">Nothing to show yet.</li>}
              </ul>

              <div className="mt-4 border-t border-line pt-3">
                <p className="label">How to read it</p>
                <ul className="mt-2 space-y-1.5 text-[11.5px] text-neutral-600">
                  <li className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: tierColor(70) }} />Score 65 or more (colour shows the best lead there)</li>
                  <li className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: tierColor(55) }} />Score 50 to 64</li>
                  <li className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: tierColor(40) }} />Below 50</li>
                  <li className="flex items-center gap-2"><span className="size-2.5 rounded-full border border-dashed border-neutral-400" />Dashed: the news names only the province</li>
                  <li>Bigger bubble means more leads in that place.</li>
                </ul>
                {unmapped > 0 && <p className="mt-2 text-[11px] text-neutral-500">{unmapped} lead{unmapped === 1 ? "" : "s"} could not be placed.</p>}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
