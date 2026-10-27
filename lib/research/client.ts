import { rowToResearch, type ResearchDbRow, type ResearchRow } from "./types";

export type ResearchOutcome = { ok: true; row: ResearchRow } | { ok: false; error: string; code?: string };

export async function runResearch(token: string, opportunityId: string): Promise<ResearchOutcome> {
  try {
    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ opportunityId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "The research failed.", code: data.code };
    return { ok: true, row: rowToResearch(data.row as ResearchDbRow) };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}
