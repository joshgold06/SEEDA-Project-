"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, Search, Undo2, X } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/AuthContext";
import type { Opportunity } from "@/lib/data";
import { timeAgo } from "@/lib/outreach";
import { chainCompanies, sameCompany } from "@/lib/research/merge";
import { runResearch } from "@/lib/research/client";
import { domainOf, safeHttpUrl, type Finding } from "@/lib/research/types";
import { useStore } from "@/lib/store";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A long quoted sentence (such as a photo caption naming six people) is trimmed to the part around the name. */
function excerpt(evidence: string, name: string): string {
  if (evidence.length <= 240) return evidence;
  const at = evidence.toLowerCase().indexOf(name.toLowerCase());
  if (at < 0) return `${evidence.slice(0, 240)}…`;
  const start = Math.max(0, at - 110);
  const end = Math.min(evidence.length, at + name.length + 130);
  return `${start > 0 ? "…" : ""}${evidence.slice(start, end)}${end < evidence.length ? "…" : ""}`;
}

const STEPS = ["Searching the web for pages about this project…", "Reading the pages…", "Checking every quote against its source…"];

const SECTIONS: { kind: Finding["kind"]; title: string; empty: string }[] = [
  { kind: "owner", title: "Owner", empty: "" },
  { kind: "contractor", title: "Contractors", empty: "" },
  { kind: "person", title: "People", empty: "" },
];

/** Looks the lead up on the public web and proposes an owner, contractors and named people, each with its source. */
export function ResearchPanel({ opp }: { opp: Opportunity }) {
  const { session } = useAuth();
  const toast = useToast();
  const { researchFor, setResearch, updateResearch, contactsFor, addContact, removeContact } = useStore();
  const research = researchFor(opp.id);
  const contacts = contactsFor(opp.id);

  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);

  useEffect(() => {
    if (!running) return;
    setStep(0);
    const t = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 7000);
    return () => window.clearInterval(t);
  }, [running]);

  const known = useMemo(() => {
    // What the headline already gave us, so the research isn't asked to "find" it again.
    const { owner, contractors } = chainCompanies({ ...opp }, undefined);
    return { owner: owner?.name ?? null, contractors: contractors.map((c) => c.name) };
  }, [opp]);

  const run = async () => {
    if (!session || running) return;
    setRunning(true);
    setError(null);
    const outcome = await runResearch(session.access_token, opp.id);
    setRunning(false);
    if (!outcome.ok) {
      setError(outcome.code === "not_configured" ? "Research isn't switched on yet. The site owner needs to add the search and AI keys." : outcome.error);
      return;
    }
    setResearch(outcome.row);
  };

  const accepted = research?.accepted;
  const dismissed = research?.dismissed ?? [];

  const isAccepted = (f: Finding) => {
    if (f.kind === "owner") return Boolean(accepted?.owner && same(accepted.owner.name, f.name));
    if (f.kind === "contractor") return Boolean(accepted?.contractors.some((c) => same(c.name, f.name)));
    return contacts.some((c) => same(c.name, f.name));
  };

  const accept = (f: Finding) => {
    if (!research || !accepted) return;
    if (f.kind === "owner") updateResearch(opp.id, { accepted: { ...accepted, owner: { name: f.name, sourceUrl: f.sourceUrl } } });
    else if (f.kind === "contractor") updateResearch(opp.id, { accepted: { ...accepted, contractors: [...accepted.contractors, { name: f.name, sourceUrl: f.sourceUrl }] } });
    else {
      const note = `Found in ${f.sourceTitle} (${domainOf(f.sourceUrl)}): "${f.evidence}"`.slice(0, 500);
      void addContact({ opportunityId: opp.id, name: f.name, role: f.role, company: f.company, note }).then((ok) => {
        if (!ok) toast.push({ message: "Couldn't save that person. Try again in a moment." });
      });
    }
    toast.push({ message: `Confirmed ${f.name}`, onAction: () => unaccept(f) });
  };

  const unaccept = (f: Finding) => {
    if (!research) return;
    const current = research.accepted;
    if (f.kind === "owner") updateResearch(opp.id, { accepted: { ...current, owner: null } });
    else if (f.kind === "contractor") updateResearch(opp.id, { accepted: { ...current, contractors: current.contractors.filter((c) => !same(c.name, f.name)) } });
    else {
      const c = contacts.find((x) => same(x.name, f.name));
      if (c) removeContact(c.id);
    }
  };

  const dismiss = (f: Finding) => {
    if (!research) return;
    updateResearch(opp.id, { dismissed: [...dismissed, f.id] });
    toast.push({ message: `Dismissed ${f.name}`, onAction: () => updateResearch(opp.id, { dismissed: dismissed.filter((d) => d !== f.id) }) });
  };

  const restore = (f: Finding) => updateResearch(opp.id, { dismissed: dismissed.filter((d) => d !== f.id) });

  // Leave out anything the headline already told us.
  const all = (research?.doc.findings ?? []).filter((f) => !(f.kind === "owner" && known.owner && sameCompany(known.owner, f.name)) && !(f.kind === "contractor" && known.contractors.some((c) => sameCompany(c, f.name))));
  const open = all.filter((f) => !dismissed.includes(f.id));
  const hidden = all.filter((f) => dismissed.includes(f.id));

  const card = (f: Finding, isHidden = false) => {
    const done = isAccepted(f);
    const link = safeHttpUrl(f.sourceUrl);
    return (
      <li key={f.id} className={`rounded-lg border p-3 ${done ? "border-brand-line bg-brand-soft" : "border-line bg-surface"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold">
              {f.name}
              {done && <span className="ml-2 inline-flex items-center gap-1 rounded bg-brand px-1.5 py-px text-[10px] font-semibold text-white"><Check className="size-3" />Confirmed</span>}
            </p>
            {(f.role || f.company) && <p className="text-[11.5px] text-neutral-500">{[f.role, f.company].filter(Boolean).join(" · ")}</p>}
          </div>
          <div className="flex shrink-0 gap-1.5">
            {isHidden ? (
              <button onClick={() => restore(f)} className="inline-flex h-[26px] items-center gap-1 rounded border border-line px-2 text-[11.5px] font-medium hover:bg-neutral-50"><Undo2 className="size-3" />Restore</button>
            ) : done ? (
              <button onClick={() => unaccept(f)} className="inline-flex h-[26px] items-center gap-1 rounded border border-line bg-surface px-2 text-[11.5px] font-medium hover:bg-neutral-50"><Undo2 className="size-3" />Undo</button>
            ) : (
              <>
                <button onClick={() => accept(f)} className="inline-flex h-[26px] items-center gap-1 rounded bg-action px-2.5 text-[11.5px] font-medium text-white hover:bg-action-hover"><Check className="size-3" />Accept</button>
                <button onClick={() => dismiss(f)} aria-label={`Dismiss ${f.name}`} title="Dismiss" className="grid size-[26px] place-items-center rounded border border-line text-neutral-500 hover:bg-neutral-50 hover:text-red-600"><X className="size-3.5" /></button>
              </>
            )}
          </div>
        </div>
        <blockquote title={f.evidence} className="mt-2 border-l-2 border-line pl-2.5 text-[12px] leading-relaxed text-neutral-600 italic">&ldquo;{excerpt(f.evidence, f.name)}&rdquo;</blockquote>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline">
            {domainOf(link)}
            <ExternalLink className="size-3" />
          </a>
        )}
      </li>
    );
  };

  return (
    <div className="mb-5 rounded-lg border border-line bg-neutral-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-[560px]">
          <h3 className="text-[13px] font-semibold">Research this lead</h3>
          <p className="mt-1 text-[11.5px] leading-relaxed text-neutral-500">
            Reads public web pages for the owner, the contractors and the named people on this project. Every finding quotes the sentence it came from and links to the page. Nothing is added until you accept it.
          </p>
        </div>
        <Button variant="primary" onClick={run} disabled={running || !session}>
          {running ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
          {running ? "Researching…" : research ? "Run again" : "Research this lead"}
        </Button>
      </div>

      {running && (
        <p role="status" className="mt-3 flex items-center gap-2 text-[12px] text-neutral-600">
          <Loader2 className="size-3.5 animate-spin text-brand" />
          {STEPS[step]} This takes about 20 to 40 seconds.
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-[12px] text-red-600">{error}</p>}

      {research && !running && (
        <div className="mt-4">
          <p className="text-[11px] text-neutral-500">
            Researched {timeAgo(research.researchedAt)} · {research.doc.sources.length} page{research.doc.sources.length === 1 ? "" : "s"} read · {all.length} finding{all.length === 1 ? "" : "s"}
          </p>

          {open.length === 0 ? (
            <p className="mt-3 text-[12px] leading-relaxed text-neutral-600">
              {research.doc.sources.length === 0
                ? "The web search found no pages about this lead."
                : all.length === 0
                  ? "Nothing new could be confirmed from these pages. The pages that were read are listed below, and the manual people searches on the right still work."
                  : "Everything found has been dealt with."}
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              {SECTIONS.map(({ kind, title }) => {
                const items = open.filter((f) => f.kind === kind);
                if (items.length === 0) return null;
                return (
                  <section key={kind}>
                    <h4 className="label !text-[10px]">{title}</h4>
                    <ul className="mt-2 space-y-2">{items.map((f) => card(f))}</ul>
                  </section>
                );
              })}
            </div>
          )}

          {hidden.length > 0 && (
            <div className="mt-3">
              <button onClick={() => setShowDismissed((v) => !v)} className="text-[11.5px] font-medium text-neutral-500 hover:text-ink hover:underline">
                {showDismissed ? "Hide" : "Show"} {hidden.length} dismissed
              </button>
              {showDismissed && <ul className="mt-2 space-y-2">{hidden.map((f) => card(f, true))}</ul>}
            </div>
          )}

          {research.doc.sources.length > 0 && (
            <details className="mt-3 text-[11.5px]">
              <summary className="cursor-pointer font-medium text-neutral-500 hover:text-ink">Pages read ({research.doc.sources.length})</summary>
              <ul className="mt-2 space-y-1">
                {research.doc.sources.map((s) => {
                  const link = safeHttpUrl(s.url);
                  return link ? (
                    <li key={s.url} className="truncate">
                      <a href={link} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">{domainOf(link)}</a>
                      <span className="text-neutral-500"> · {s.title}</span>
                    </li>
                  ) : null;
                })}
              </ul>
            </details>
          )}

          <p className="mt-3 text-[10.5px] leading-relaxed text-neutral-400">Found by an AI model reading public pages. Check each source before you rely on it, especially before contacting anyone.</p>
        </div>
      )}
    </div>
  );
}
