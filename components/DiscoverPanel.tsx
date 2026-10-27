"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { runDiscover, type DiscoverResult } from "@/lib/leads/client";
import { SEARCH_PRESETS } from "@/lib/leads/presets";
import { ACTIVE_REGION_SENTENCE } from "@/lib/leads/taxonomy";
import { useStore } from "@/lib/store";

function summarize(r: DiscoverResult): string {
  const parts = [`${r.added} new lead${r.added === 1 ? "" : "s"} added`];
  if (r.alreadySaved) parts.push(`${r.alreadySaved} already saved`);
  if (r.duplicatesMerged) parts.push(`${r.duplicatesMerged} repeat stories merged`);
  if (r.rejected) parts.push(`${r.rejected} rejected by validation`);
  if (r.lowRelevance) parts.push(`${r.lowRelevance} scored too low`);
  return `Read ${r.found} headlines: ${parts.join(", ")}.`;
}

export function DiscoverPanel({ locked = false }: { locked?: boolean }) {
  const { session, profile } = useAuth();
  const { reset } = useStore();
  const [custom, setCustom] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; detail?: string } | null>(null);

  async function run(key: string, payload: { presetId?: string; query?: string }) {
    if (!session) return;
    setRunning(key);
    setMessage(null);
    const outcome = await runDiscover(session.access_token, payload, profile?.initials);
    if (!outcome.ok) {
      setMessage({ tone: "error", text: outcome.error });
    } else {
      const top = Object.entries(outcome.result.rejectionReasons).sort((x, y) => y[1] - x[1])[0];
      setMessage({ tone: "ok", text: summarize(outcome.result), detail: top ? `Most common rejection: ${top[0]} (${top[1]}).` : undefined });
      reset();
    }
    setRunning(null);
  }
  const busy = running !== null || locked;

  return (
    <div className="text-left">
      <p className="text-[12.5px] leading-relaxed text-neutral-500">
        Searches recent public news (30 days, or 90 for contractor awards) for major projects in {ACTIVE_REGION_SENTENCE}.
        Each headline is checked, scored against EPCMst&apos;s keywords, and added to your Morning Scan only if it passes.
        Open a lead to find the owner, the contractors and the people on the project.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {SEARCH_PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => run(p.id, { presetId: p.id })}
            disabled={busy}
            className="inline-flex h-[28px] items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12px] font-medium text-ink transition-colors hover:bg-neutral-50 disabled:opacity-50"
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
          className="inline-flex h-[32px] items-center gap-1.5 rounded bg-action px-4 text-[12.5px] font-medium text-white transition-colors hover:bg-action-hover disabled:opacity-50"
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
    </div>
  );
}
