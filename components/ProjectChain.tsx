"use client";

import { useId, useMemo, useState } from "react";
import { Download, ExternalLink, Trash2, UserPlus } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui";
import { cleanLink, Contact, contactsToCsv, downloadCsv } from "@/lib/contacts";
import type { Opportunity } from "@/lib/data";
import { linkedInPeople } from "@/lib/leads/people";
import { chainCompanies } from "@/lib/research/merge";
import type { ResearchRow } from "@/lib/research/types";
import { useStore } from "@/lib/store";
import { ResearchPanel } from "./ResearchPanel";

// The chain Max works through by hand: the owner, the project, the contractors on it, and the
// people at those companies. The first three come from the lead; the people are the contacts the
// signed-in person has saved against it.

type Kind = "owner" | "project" | "contractor" | "person";

interface Node {
  key: string;
  kind: Kind;
  top: string;
  name: string;
  href?: string;
  ghost?: boolean;
}

interface Edge {
  from: string;
  to: string;
  dashed?: boolean;
}

const W = 860;
const NODE_H = 46;
const GAP = 14;
const COLS: Record<Kind, { x: number; w: number }> = {
  owner: { x: 0, w: 170 },
  project: { x: 215, w: 210 },
  contractor: { x: 470, w: 180 },
  person: { x: 695, w: 165 },
};

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function buildChain(opp: Opportunity, contacts: Contact[], research: ResearchRow | undefined) {
  const { owner: ownerCompany, contractors: contractorCompanies } = chainCompanies(opp, research);
  const ownerKnown = ownerCompany !== null;
  const contractors = contractorCompanies.slice(0, 6).map((c) => c.name);

  const nodes: Node[] = [
    ownerCompany
      ? { key: "owner", kind: "owner", top: ownerCompany.confirmed ? "Owner · confirmed" : "Owner", name: ownerCompany.name, href: linkedInPeople(ownerCompany.name) }
      : { key: "owner", kind: "owner", top: "Owner", name: "Not named yet", ghost: true },
    { key: "project", kind: "project", top: "Project", name: opp.fullTitle ?? opp.title },
  ];
  const edges: Edge[] = [{ from: "owner", to: "project", dashed: !ownerKnown }];

  if (contractors.length === 0) {
    nodes.push({ key: "c-none", kind: "contractor", top: "Contractors", name: "None found yet", ghost: true });
    edges.push({ from: "project", to: "c-none", dashed: true });
  }
  contractorCompanies.slice(0, 6).forEach((c, i) => {
    nodes.push({ key: `c-${i}`, kind: "contractor", top: c.confirmed ? "Contractor · confirmed" : "Contractor", name: c.name, href: linkedInPeople(c.name) });
    edges.push({ from: "project", to: `c-${i}` });
  });

  if (contacts.length === 0) {
    nodes.push({ key: "p-none", kind: "person", top: "People", name: "None saved yet", ghost: true });
    edges.push({ from: contractors.length ? "c-0" : "project", to: "p-none", dashed: true });
  }
  contacts.slice(0, 8).forEach((c) => {
    nodes.push({ key: `p-${c.id}`, kind: "person", top: c.role || "Contact", name: c.name, href: c.linkedinUrl });
    // Hang each person off their own company when it is on the chain, otherwise off the project.
    const company = c.company ?? "";
    const contractorIndex = company ? contractors.findIndex((n) => same(n, company)) : -1;
    if (contractorIndex >= 0) edges.push({ from: `c-${contractorIndex}`, to: `p-${c.id}` });
    else if (ownerCompany && company && same(ownerCompany.name, company)) edges.push({ from: "owner", to: `p-${c.id}`, dashed: true });
    else edges.push({ from: "project", to: `p-${c.id}`, dashed: true });
  });
  return { nodes, edges, overflow: Math.max(0, contacts.length - 8) };
}

function layout(nodes: Node[]) {
  const byKind = (k: Kind) => nodes.filter((n) => n.kind === k);
  const tallest = Math.max(...(["owner", "project", "contractor", "person"] as Kind[]).map((k) => byKind(k).length));
  const height = tallest * NODE_H + (tallest - 1) * GAP;
  const pos = new Map<string, { x: number; y: number; w: number }>();
  (["owner", "project", "contractor", "person"] as Kind[]).forEach((kind) => {
    const col = byKind(kind);
    const colHeight = col.length * NODE_H + (col.length - 1) * GAP;
    const startY = (height - colHeight) / 2;
    col.forEach((n, i) => pos.set(n.key, { x: COLS[kind].x, y: startY + i * (NODE_H + GAP), w: COLS[kind].w }));
  });
  return { pos, height };
}

export function ProjectChain({ opp, contacts, research }: { opp: Opportunity; contacts: Contact[]; research?: ResearchRow }) {
  const { nodes, edges, overflow } = useMemo(() => buildChain(opp, contacts, research), [opp, contacts, research]);
  const { pos, height } = useMemo(() => layout(nodes), [nodes]);
  const summary = `Chain for ${opp.fullTitle ?? opp.title}: ${nodes.filter((n) => !n.ghost).map((n) => `${n.top} ${n.name}`).join("; ")}`;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={summary} className="min-w-[640px] w-full" style={{ maxHeight: 520 }}>
        <g fill="none" strokeWidth={1.6}>
          {edges.map((e) => {
            const a = pos.get(e.from);
            const b = pos.get(e.to);
            if (!a || !b) return null;
            const x1 = a.x + a.w;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_H / 2;
            const mid = (x1 + x2) / 2;
            return <path key={`${e.from}-${e.to}`} d={`M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`} stroke="var(--color-brand-line)" strokeDasharray={e.dashed ? "5 5" : undefined} />;
          })}
        </g>
        {nodes.map((n) => {
          const p = pos.get(n.key)!;
          const chars = Math.floor((p.w - 20) / 6.4);
          const body = (
            <g>
              <title>{`${n.top}: ${n.name}`}</title>
              <rect
                x={p.x}
                y={p.y}
                width={p.w}
                height={NODE_H}
                rx={9}
                style={{
                  fill: n.kind === "project" ? "var(--color-brand-soft)" : n.ghost ? "transparent" : "var(--color-surface)",
                  stroke: n.kind === "project" ? "var(--color-brand)" : "var(--color-line)",
                  strokeDasharray: n.ghost ? "4 4" : undefined,
                  strokeWidth: n.kind === "project" ? 1.5 : 1,
                }}
              />
              <text x={p.x + 11} y={p.y + 17} fontSize={9} letterSpacing={0.6} style={{ fill: "var(--color-muted)", textTransform: "uppercase" }}>
                {clip(n.top, chars)}
              </text>
              <text x={p.x + 11} y={p.y + 34} fontSize={12} fontWeight={n.ghost ? 400 : 600} style={{ fill: n.ghost ? "var(--color-muted)" : "var(--color-ink)" }}>
                {clip(n.name, chars)}
              </text>
              {n.href && !n.ghost && (
                <g style={{ stroke: "var(--color-neutral-400)" }} strokeWidth={1.4} fill="none" transform={`translate(${p.x + p.w - 20} ${p.y + 9})`}>
                  <path d="M5 2H2v8h8V7M7 1h4v4M11 1L5.5 6.5" />
                </g>
              )}
            </g>
          );
          return n.href && !n.ghost ? (
            <a key={n.key} href={n.href} target="_blank" rel="noopener noreferrer" className="cursor-pointer outline-none focus-visible:opacity-80 [&:hover_rect]:stroke-[var(--color-brand)]">
              {body}
            </a>
          ) : (
            <g key={n.key}>{body}</g>
          );
        })}
      </svg>
      {overflow > 0 && <p className="mt-1 text-[11px] text-neutral-500">{overflow} more saved contact{overflow === 1 ? "" : "s"} not drawn here. They are all in the list and the CSV.</p>}
    </div>
  );
}

const FIELD = "mt-1 h-9 w-full rounded border border-line bg-surface px-3 text-[13px] text-ink outline-none focus:border-brand";

export function ProjectChainSection({ opp }: { opp: Opportunity }) {
  const { contactsFor, addContact, removeContact, opportunities, researchFor } = useStore();
  const toast = useToast();
  const contacts = contactsFor(opp.id);
  const research = researchFor(opp.id);
  const companies = useMemo(() => {
    const { owner, contractors } = chainCompanies(opp, research);
    return [...(owner ? [owner.name] : []), ...contractors.map((c) => c.name)];
  }, [opp, research]);

  const listId = useId();
  const blank = { name: "", role: "", company: "", linkedin: "", note: "" };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || saving) return;
    const link = cleanLink(form.linkedin);
    if (form.linkedin.trim() && !link) {
      toast.push({ message: "That link doesn't look like a web address, so it wasn't saved." });
      return;
    }
    setSaving(true);
    const ok = await addContact({
      opportunityId: opp.id,
      name: form.name.trim(),
      role: form.role.trim() || undefined,
      company: form.company.trim() || undefined,
      linkedinUrl: link,
      note: form.note.trim() || undefined,
    });
    setSaving(false);
    if (ok) {
      setForm(blank);
      setAdding(false);
    } else {
      toast.push({ message: "Couldn't save that contact. Try again in a moment." });
    }
  };

  const exportCsv = () => downloadCsv(`contacts-${opp.ref.toLowerCase()}.csv`, contactsToCsv(contacts, opportunities));

  return (
    <div>
      <ResearchPanel opp={opp} />
      <ProjectChain opp={opp} contacts={contacts} research={research} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <h3 className="text-[12.5px] font-semibold">Saved contacts <span className="font-normal text-neutral-500">({contacts.length})</span></h3>
        <div className="flex gap-2">
          <Button onClick={exportCsv} disabled={contacts.length === 0} title="Download this lead's contacts as a spreadsheet">
            <Download className="size-3.5" />
            Export CSV
          </Button>
          <Button variant="primary" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
            <UserPlus className="size-3.5" />
            Add a contact
          </Button>
        </div>
      </div>

      {adding && (
        <form onSubmit={submit} className="mt-3 grid gap-3 rounded-lg border border-line bg-neutral-50 p-4 text-[12px] font-medium text-neutral-700 sm:grid-cols-2">
          <label className="block">Name *<input required autoFocus maxLength={120} className={FIELD} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="block">Role<input maxLength={120} placeholder="Project manager" className={FIELD} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></label>
          <label className="block">
            Company
            <input list={listId} maxLength={120} placeholder="Pick one on the chain or type another" className={FIELD} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            <datalist id={listId}>{companies.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="block">LinkedIn link<input maxLength={300} placeholder="linkedin.com/in/…" className={FIELD} value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} /></label>
          <label className="block sm:col-span-2">Note<input maxLength={500} placeholder="How you found them, what they handle" className={FIELD} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <p className="text-[11px] font-normal text-neutral-500">Only you can see saved contacts.</p>
            <div className="flex gap-2">
              <Button type="button" onClick={() => { setAdding(false); setForm(blank); }}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={saving}>{saving ? "Saving…" : "Save contact"}</Button>
            </div>
          </div>
        </form>
      )}

      {contacts.length > 0 ? (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{c.name}</p>
                <p className="truncate text-[11.5px] text-neutral-500">{[c.role, c.company].filter(Boolean).join(" · ") || "No role or company saved"}</p>
                {c.note && <p className="mt-1 text-[11.5px] leading-snug text-neutral-600">{c.note}</p>}
              </div>
              {c.linkedinUrl && (
                <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${c.name}'s link`} title="Open link" className="mt-0.5 text-neutral-400 hover:text-brand">
                  <ExternalLink className="size-3.5" />
                </a>
              )}
              <button
                onClick={() => {
                  removeContact(c.id);
                  toast.push({ message: `Removed ${c.name}`, onAction: () => void addContact({ opportunityId: c.opportunityId, name: c.name, role: c.role, company: c.company, linkedinUrl: c.linkedinUrl, note: c.note }) });
                }}
                aria-label={`Remove ${c.name}`}
                title="Remove"
                className="mt-0.5 text-neutral-400 hover:text-red-600"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[12px] leading-relaxed text-neutral-500">
          Nobody saved yet. Use the searches on the right to find people at the owner and contractors, then save them here and they join the chain.
        </p>
      )}
    </div>
  );
}
