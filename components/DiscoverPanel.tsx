"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { SEARCH_PRESETS } from "@/lib/leads/presets";
import { useStore } from "@/lib/store";

interface DiscoverResult {
  found: number;
  added: number;
  alreadySaved: number;
  duplicatesMerged: number;
  lowRelevance: number;
  rejected: number;
  rejectionReasons: Record<string, number>;
}

function summarize(r: DiscoverResult): string {
  const parts = [`${r.added} new lead${r.added === 1 ? "" : "s"} added`];
  if (r.alreadySaved) parts.push(`${r.alreadySaved} already saved`);
  if (r.duplicatesMerged) parts.push(`${r.duplicatesMerged} repeat stories merged`);
  if (r.rejected) parts.push(`${r.rejected} rejected by validation`);
  if (r.lowRelevance) parts.push(`${r.lowRelevance} scored too low`);
  return `Read ${r.found} headlines: ${parts.join(", ")}.`;
}

export function DiscoverPanel() {
  const { session, profile } = useAuth();
  const { reset } = useStore();
  const [custom, setCustom] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; detail?: string } | null>(null);

  async function run(key: string, payload: { presetId?: string; query?: string }) {
    if (!session) return;
    setRunning(key);
    setMessage(null);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ...payload, assignee: profile?.initials }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ tone: "error", text: data.error ?? "The search failed." });
      } else {
        const result = data as DiscoverResult;
        const top = Object.entries(result.rejectionReasons).sort((a, b) => b[1] - a[1])[0];
        setMessage({ tone: "ok", text: summarize(result), detail: top ? `Most common rejection: ${top[0]} (${top[1]}).` : undefined });
        reset();
      }
    } catch {
      setMessage({ tone: "error", text: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setRunning(null);
    }
  }

  const busy = running !== null;

  return (
    <section className="mt-10 rounded-lg border border-line bg-white p-5 text-left shadow-sm">
      <h2 className="label !text-neutral-600">Find new signals</h2>
      <p className="mt-2 text-[12.5px] leading-relaxed text-neutral-500">
        Searches recent public news (30 days, or 90 for contractor awards) for major projects in Alberta, BC and Saskatchewan.
        Each headline is checked, scored against EPCMst&apos;s keywords, and added to your Morning Scan only if it passes.
        Open a lead to find the owner, the contractors and the people on the project.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {SEARCH_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => run(p.id, { presetId: p.id })}
            disabled={busy}
            className="inline-flex h-[28px] items-center gap-1.5 rounded-full border border-line bg-white px-3 text-[12px] font-medium text-ink transition-colors hover:bg-neutral-50 disabled:opacity-50"
          >
            {running === p.id && <Loader2 className="size-3 animate-spin" />}
            {p.label}
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom.trim().length >= 3) run("custom", { query: custom });
        }}
      >
        <label className="flex h-[32px] flex-1 items-center gap-2 rounded border border-line bg-neutral-50 px-2.5 text-neutral-500 focus-within:border-neutral-400">
          <Search className="size-3.5" />
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            maxLength={200}
            placeholder='Or search your own, e.g. "gas plant" Fort Saskatchewan'
            className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-neutral-400"
          />
        </label>
        <button
          type="submit"
          disabled={busy || custom.trim().length < 3}
          className="inline-flex h-[32px] items-center gap-1.5 rounded bg-ink px-4 text-[12.5px] font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          {running === "custom" && <Loader2 className="size-3 animate-spin" />}
          Search
        </button>
      </form>
      {message && (
        <p role="status" className={`mt-3 text-[12.5px] ${message.tone === "ok" ? "text-brand-dark" : "text-red-600"}`}>
          {message.text}
          {message.detail && <span className="block text-[11.5px] text-neutral-500">{message.detail}</span>}
        </p>
      )}
    </section>
  );
}
