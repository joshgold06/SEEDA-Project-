"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Eye, Search } from "lucide-react";
import { Opportunity, STAGES } from "@/lib/data";
import { useAuth } from "@/lib/AuthContext";
import { useFilters } from "@/lib/filters";
import { isTyping } from "@/lib/keys";
import { getPreviousVisit, isNewSince } from "@/lib/lastVisit";
import { useStore } from "@/lib/store";
import { useWeights } from "@/lib/weights";
import { ActiveFilterChips, FilterButton } from "./FilterPanel";
import { useToast } from "./Toast";
import { Score, SectorIcon, Tag } from "./ui";

type SortKey = "source" | "score" | "deadline";

const OWNER_UNKNOWN = "Not identified in headline";

export function SignalList({ mode }: { mode: "scan" | "shortlist" }) {
  const { opportunities, loaded, update } = useStore();
  const { scoreOf } = useWeights();
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey | null>(null);
  const previousVisit = user ? getPreviousVisit(user.id) : null;

  const { matches, activeCount } = useFilters();
  const universe = mode === "scan" ? opportunities.filter((o) => o.inScan) : opportunities.filter((o) => o.stage);
  const base = universe.filter(matches);
  const hrefFor = (o: Opportunity) => (mode === "scan" ? `/scan/${o.id}` : `/shortlist/${o.id}`);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = base.filter((o) => !q || [o.title, o.owner, o.type, o.phaseTag, o.category ?? ""].some((f) => f.toLowerCase().includes(q)));
    if (sort === "source") list = [...list].sort((a, b) => a.type.localeCompare(b.type));
    else if (sort === "deadline") list = [...list].sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));
    else if (mode === "scan") list = [...list].sort((a, b) => scoreOf(b) - scoreOf(a));
    return [...list].sort((a, b) => Number(a.dismissed) - Number(b.dismissed));
    // scoreOf changes whenever the weights do, which is what re-ranks the list
  }, [base, query, sort, mode, scoreOf]);

  // Keyboard triage: J/K move through the list, S shortlists, X marks not relevant, W watches.
  // The handler is re-attached on every change so it always sees the current list and lead.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || document.querySelector('[role="dialog"]')) return;
      const key = e.key.toLowerCase();
      if (!["j", "k", "s", "x", "w"].includes(key)) return;
      const index = items.findIndex((o) => hrefFor(o) === pathname);
      const current = index >= 0 ? items[index] : undefined;

      if (key === "j" || key === "k") {
        if (items.length === 0) return;
        const next = index < 0 ? 0 : Math.min(Math.max(index + (key === "j" ? 1 : -1), 0), items.length - 1);
        e.preventDefault();
        router.push(hrefFor(items[next]));
        return;
      }
      if (!current || (key === "s" && mode !== "scan")) return;
      e.preventDefault();
      const previous = { stage: current.stage, watched: current.watched, dismissed: current.dismissed };
      const act = (patch: Partial<Opportunity>, message: string) => {
        update(current.id, patch);
        toast.push({ message, onAction: () => update(current.id, previous) });
      };
      if (key === "s") act({ stage: current.stage ? null : "spotted", dismissed: false }, current.stage ? "Removed from your shortlist" : "Added to your shortlist");
      else if (key === "w") act({ watched: !current.watched }, current.watched ? "Stopped watching this lead" : "Now watching this lead");
      else {
        act({ dismissed: !current.dismissed }, current.dismissed ? "Restored to your list" : "Marked not relevant");
        // After marking one not relevant, move on to the next lead that still matters.
        if (!current.dismissed) {
          const next = items.slice(index + 1).find((o) => !o.dismissed) ?? items.slice(0, index).reverse().find((o) => !o.dismissed);
          if (next) router.push(hrefFor(next));
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const heading = mode === "scan" ? "Morning Scan" : "Shortlist";
  const liveCount = base.filter((o) => !o.dismissed).length;
  const newCount = mode === "scan" ? base.filter((o) => !o.dismissed && isNewSince(o.createdAt, previousVisit)).length : 0;
  const count = activeCount
    ? `${mode === "scan" ? liveCount : base.length} of ${mode === "scan" ? universe.filter((o) => !o.dismissed).length : universe.length}`
    : mode === "scan" ? (newCount ? `${newCount} new` : `${liveCount} leads`) : `${base.length} spotted`;

  return (
    <aside className="signal-list no-print sticky top-0 flex h-screen w-[316px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">{heading}</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${mode === "scan" ? "bg-brand-soft text-brand-dark" : "bg-neutral-100 text-neutral-600"}`}>{count}</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <label className="flex h-[32px] min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-neutral-50 px-2.5 text-neutral-500 focus-within:border-brand">
            <Search className="size-3.5 shrink-0" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={mode === "scan" ? "Search leads" : "Filter shortlist"} className="w-full min-w-0 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-neutral-400" />
          </label>
          <FilterButton leads={universe.filter((o) => !o.dismissed)} align="right" panelWidth={284} />
        </div>
        <ActiveFilterChips className="mt-2" />
        {mode === "scan" && (
          <div className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-neutral-500">
            Sort by
            {(["source", "score", "deadline"] as SortKey[]).map((k) => (
              <button key={k} onClick={() => setSort(sort === k ? null : k)} aria-pressed={sort === k} className={`rounded-full px-2 py-0.5 font-medium capitalize transition-colors ${sort === k ? "bg-action text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>{k}</button>
            ))}
          </div>
        )}
      </div>
      <ul className="flex-1 overflow-y-auto border-t border-line">
        {!loaded &&
          [0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="animate-pulse border-b border-line px-4 py-3.5">
              <div className="flex justify-between"><div className="h-2.5 w-20 rounded bg-neutral-200" /><div className="h-4 w-14 rounded-full bg-neutral-200" /></div>
              <div className="mt-3 h-3 w-5/6 rounded bg-neutral-200" />
              <div className="mt-2 h-2.5 w-1/2 rounded bg-neutral-100" />
            </li>
          ))}
        {loaded &&
          items.map((o) => {
            const href = hrefFor(o);
            const selected = pathname === href;
            const score = scoreOf(o);
            const muted = o.dismissed || score < 50;
            const fresh = mode === "scan" && isNewSince(o.createdAt, previousVisit);
            const owner = o.owner === OWNER_UNKNOWN ? "Owner not named" : o.owner;
            return (
              <li key={o.id} className="rise-in border-b border-line">
                <Link href={href} className={`block border-l-[3px] px-4 py-3.5 transition-colors ${selected ? "border-brand bg-brand-soft/70" : "border-transparent hover:bg-neutral-50"} ${o.dismissed ? "opacity-50" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-neutral-500">
                      <SectorIcon category={o.category} className="size-3 shrink-0 text-neutral-400" />
                      <span className="truncate">{mode === "scan" ? o.phaseTag : o.type}</span>
                      {fresh && <span className="rounded bg-brand px-1 py-px text-[8.5px] font-bold tracking-wider text-white">NEW</span>}
                    </span>
                    <Score value={score} />
                  </div>
                  <h3 className={`mt-2 line-clamp-2 text-[13px] leading-snug font-semibold ${muted ? "text-neutral-500" : "text-ink"}`}>{o.title}</h3>
                  {mode === "scan" ? (
                    <p className="mt-1.5 flex items-center gap-1 truncate text-[11px] text-neutral-500">
                      {o.watched && <Eye className="size-3 shrink-0 text-brand" aria-label="Watching" />}
                      <span className="truncate">{owner} · {o.timing}</span>
                    </p>
                  ) : (
                    <div className="mt-2">
                      <Tag tone={o.stage === "outreach" ? "brand" : "neutral"}>{o.stage === "outreach" ? "Outreach Drafting" : STAGES.find((s) => s.id === o.stage)?.label}</Tag>
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        {loaded && items.length === 0 && (
          <li className="px-4 py-10 text-center text-[12px] text-neutral-500">{query || activeCount ? `No ${mode === "scan" ? "leads" : "shortlisted leads"} match ${activeCount ? "these filters" : "your search"}.` : mode === "scan" ? "No leads yet. They'll appear here as searches finish." : "Nothing shortlisted yet."}</li>
        )}
      </ul>
      <p className="border-t border-line px-4 py-2 text-[10.5px] text-neutral-500">
        {(mode === "scan" ? [["J", "K"], ["S"], ["X"]] : [["J", "K"], ["X"]]).map((keys, i) => (
          <span key={i} className="mr-2.5 inline-flex items-center gap-1">
            {keys.map((k) => <kbd key={k} className="rounded border border-line bg-neutral-50 px-1 font-mono text-[9.5px] text-ink">{k}</kbd>)}
            <span>{keys.length === 2 ? "move" : keys[0] === "S" ? "shortlist" : "dismiss"}</span>
          </span>
        ))}
        <button onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }))} className="text-brand hover:underline">more</button>
      </p>
    </aside>
  );
}
