export interface DiscoverResult {
  found: number;
  added: number;
  alreadySaved: number;
  duplicatesMerged: number;
  lowRelevance: number;
  rejected: number;
  rejectionReasons: Record<string, number>;
}

export type DiscoverOutcome = { ok: true; result: DiscoverResult } | { ok: false; error: string };

export async function runDiscover(token: string, payload: { presetId?: string; query?: string }, assignee?: string): Promise<DiscoverOutcome> {
  try {
    const res = await fetch("/api/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...payload, assignee }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? "The search failed." };
    return { ok: true, result: data as DiscoverResult };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}
