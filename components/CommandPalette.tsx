"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Layers, Map, Search, Settings, TrendingUp, User, Zap } from "lucide-react";
import { isTyping, SHORTCUTS } from "@/lib/keys";
import { useStore } from "@/lib/store";
import { useWeights } from "@/lib/weights";
import { SectorIcon } from "./ui";

interface Item {
  key: string;
  label: string;
  sub?: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
}

const PAGES: Item[] = [
  { key: "p-scan", label: "Morning Scan", href: "/scan", icon: <Zap className="size-4" /> },
  { key: "p-map", label: "Map", href: "/map", icon: <Map className="size-4" /> },
  { key: "p-shortlist", label: "Shortlist", href: "/shortlist", icon: <Layers className="size-4" /> },
  { key: "p-pipeline", label: "Pipeline", href: "/pipeline", icon: <TrendingUp className="size-4" /> },
  { key: "p-settings", label: "Settings", href: "/settings", icon: <Settings className="size-4" /> },
  { key: "p-profile", label: "Profile", href: "/profile", icon: <User className="size-4" /> },
];

/** Ctrl+K (or Cmd+K) opens one search box for every lead and page; "?" opens it with the shortcut list. */
export function CommandPalette() {
  const router = useRouter();
  const { opportunities } = useStore();
  const { scoreOf } = useWeights();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "?" && !isTyping(e.target) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PAGES;
    const pages = PAGES.filter((p) => p.label.toLowerCase().includes(q));
    const leads = opportunities
      .filter((o) => [o.title, o.fullTitle ?? "", o.owner, o.location, o.category ?? "", o.ref].some((f) => f.toLowerCase().includes(q)))
      .sort((a, b) => scoreOf(b) - scoreOf(a))
      .slice(0, 8)
      .map<Item>((o) => ({
        key: o.id,
        label: o.title,
        sub: [o.owner === "Not identified in headline" ? "Owner not named" : o.owner, o.location].join(" · "),
        href: o.inScan ? `/scan/${o.id}` : `/shortlist/${o.id}`,
        icon: <SectorIcon category={o.category} className="size-4" />,
        badge: o.dismissed ? "Not relevant" : o.stage ? "Shortlisted" : undefined,
      }));
    return [...leads, ...pages];
  }, [query, opportunities, scoreOf]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const go = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(items[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="no-print fixed inset-0 z-[60] grid place-items-start justify-items-center bg-black/35 px-4 pt-[14vh]" onMouseDown={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Search" onMouseDown={(e) => e.stopPropagation()} className="rise-in w-full max-w-[560px] overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
        <label className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 text-neutral-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search leads by project, company or place"
            aria-label="Search leads and pages"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            className="h-12 w-full bg-transparent text-[14px] outline-none placeholder:text-neutral-400"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">Esc</kbd>
        </label>

        <ul id="palette-list" ref={listRef} role="listbox" className="max-h-[340px] overflow-y-auto py-1.5">
          {!query.trim() && <li className="label px-4 pt-1.5 pb-1 !text-[10px]">Go to</li>}
          {items.map((item, i) => (
            <li key={item.key} role="option" aria-selected={i === active} data-index={i}>
              <button onMouseEnter={() => setActive(i)} onClick={() => go(item)} className={`flex w-full items-center gap-3 px-4 py-2 text-left ${i === active ? "bg-brand-soft" : ""}`}>
                <span className="text-neutral-500">{item.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{item.label}</span>
                  {item.sub && <span className="block truncate text-[11px] text-neutral-500">{item.sub}</span>}
                </span>
                {item.badge && <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">{item.badge}</span>}
              </button>
            </li>
          ))}
          {items.length === 0 && <li className="px-4 py-8 text-center text-[12.5px] text-neutral-500">Nothing matches &ldquo;{query}&rdquo;.</li>}
        </ul>

        {!query.trim() && (
          <div className="border-t border-line bg-neutral-50 px-4 py-3">
            <p className="label !text-[10px]">Keyboard shortcuts</p>
            <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5">
              {SHORTCUTS.map((s) => (
                <li key={s.what} className="flex items-center gap-2 text-[11.5px] text-neutral-600">
                  <span className="flex shrink-0 gap-1">{s.keys.map((k) => <kbd key={k} className="rounded border border-line bg-surface px-1.5 py-px font-mono text-[10px] text-ink">{k}</kbd>)}</span>
                  <span className="truncate">{s.what}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
