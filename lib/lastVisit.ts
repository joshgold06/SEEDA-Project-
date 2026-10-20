// Tracks when a user was last here, so leads added since then can be marked "new".
// A new visit starts after 30 idle minutes; within one visit the same "previous
// visit" time is kept, so a page refresh doesn't make the new badges vanish.

const SESSION_GAP_MS = 30 * 60 * 1000;
let cache: { userId: string; previous: string | null } | null = null;

export function getPreviousVisit(userId: string): string | null {
  if (typeof window === "undefined") return null;
  if (cache?.userId === userId) return cache.previous;

  const key = `epcmst-visit:${userId}`;
  const now = Date.now();
  let previous: number | null = null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? "null") as { previous: number | null; last: number } | null;
    if (!saved) previous = null;
    else previous = now - saved.last > SESSION_GAP_MS ? saved.last : saved.previous;
    window.localStorage.setItem(key, JSON.stringify({ previous, last: now }));
  } catch {
    previous = null;
  }
  cache = { userId, previous: previous === null ? null : new Date(previous).toISOString() };
  return cache.previous;
}

export const isNewSince = (createdAt: string | undefined, previous: string | null) =>
  Boolean(createdAt && previous && createdAt > previous);
