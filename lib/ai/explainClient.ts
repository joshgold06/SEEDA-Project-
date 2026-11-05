import type { Explained } from "./explain";

export type ExplainOutcome = { ok: true; summary: Explained } | { ok: false; error: string; code?: string };

export async function requestExplain(token: string, opportunityId: string): Promise<ExplainOutcome> {
  try {
    const res = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ opportunityId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "The AI summary failed.", code: data.code };
    return { ok: true, summary: data as Explained };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}
