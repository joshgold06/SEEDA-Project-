import type { Opportunity } from "./data";
import { STAGES } from "./data";

// A contact is one person a user saved against a lead: where they work, their role, and a note.
// They are typed in by the person using the app (found by hand, e.g. on LinkedIn) and are
// private to that person. Nothing here is scraped.

export type Contact = {
  id: string;
  opportunityId: string;
  name: string;
  role?: string;
  company?: string;
  linkedinUrl?: string;
  note?: string;
  createdAt: number;
};

export type NewContact = Omit<Contact, "id" | "createdAt">;

export type ContactRow = {
  id: string;
  opportunity_id: string;
  name: string;
  role: string | null;
  company: string | null;
  linkedin_url: string | null;
  note: string | null;
  created_at: string;
};

export const rowToContact = (row: ContactRow): Contact => ({
  id: row.id,
  opportunityId: row.opportunity_id,
  name: row.name,
  role: row.role ?? undefined,
  company: row.company ?? undefined,
  linkedinUrl: row.linkedin_url ?? undefined,
  note: row.note ?? undefined,
  createdAt: new Date(row.created_at).getTime(),
});

export const contactToRow = (userId: string, c: Contact) => ({
  id: c.id,
  user_id: userId,
  opportunity_id: c.opportunityId,
  name: c.name,
  role: c.role ?? null,
  company: c.company ?? null,
  linkedin_url: c.linkedinUrl ?? null,
  note: c.note ?? null,
  created_at: new Date(c.createdAt).toISOString(),
});

/** Make a pasted LinkedIn link safe to open: only http(s) links are kept. */
export function cleanLink(raw: string | undefined): string | undefined {
  const text = raw?.trim();
  if (!text) return undefined;
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;

const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;

/**
 * Spreadsheet formulas can run when a CSV is opened: a cell starting with = + - or @ is treated as
 * one. Prefixing an apostrophe keeps typed text (a name, a note) as plain text.
 */
const safe = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

export function contactsToCsv(contacts: Contact[], leads: Opportunity[]): string {
  const byId = new Map(leads.map((o) => [o.id, o]));
  const header = ["Name", "Role", "Company", "LinkedIn", "Note", "Project", "Project owner", "Stage", "Score", "Saved on"];
  const rows = contacts.map((c) => {
    const lead = byId.get(c.opportunityId);
    return [
      c.name,
      c.role ?? "",
      c.company ?? "",
      c.linkedinUrl ?? "",
      c.note ?? "",
      lead?.fullTitle ?? lead?.title ?? "",
      lead && lead.owner !== "Not identified in headline" && lead.owner !== "Unknown owner" ? lead.owner : "",
      lead?.stage ? (STAGES.find((s) => s.id === lead.stage)?.label ?? "") : "",
      lead ? String(lead.score) : "",
      new Date(c.createdAt).toISOString().slice(0, 10),
    ];
  });
  return [header, ...rows].map((row) => row.map((cell) => quote(safe(cell))).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  // The BOM makes Excel read accents correctly.
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
