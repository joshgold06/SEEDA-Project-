// Small text helpers shared by the official-record adapters.

const KEEP_UPPER = new Set(["LP", "GP", "PCL", "BC", "AB", "SK", "MB", "ON", "NW", "NE", "SW", "SE", "YYC", "LRT", "CN", "CP", "II", "III", "IV", "EPC", "LNG", "ATCO", "TC", "JV"]);

/** "BIRD-WRIGHT JOINT VENTURE" -> "Bird-Wright Joint Venture". Mixed-case text is left alone. */
export function titleCase(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean !== clean.toUpperCase()) return clean;
  return clean
    .toLowerCase()
    .replace(/(^|[\s\-/(])([a-z])/g, (_, pre: string, ch: string) => pre + ch.toUpperCase())
    .replace(/\b[A-Za-z]{1,3}\b/g, (w) => (KEEP_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : w))
    .replace(/\b(Of|And|The|For|At|In)\b(?!$)/g, (w, _x, offset: number) => (offset === 0 ? w : w.toLowerCase()));
}

const COMPANY_WORDS = /\b(inc|ltd|limited|corp|corporation|company|co|llp|lp|gp|partnership|group|holdings|construction|constructors|builders?|contracting|contractors|developments?|properties|management|engineering|architect(?:s|ure)?|projects?|homes|industries|services|energy|resources|power|utilities|alliance|joint venture|enterprises|solutions|ventures|realty|investments?|capital|mechanical|electric(?:al)?|steel|mining|mines|pipelines?|midstream|logistics|systems)\b/i;
const DESIGN_FIRM = /\b(architect(?:s|ure)?|architectural|engineer(?:s|ing)?|design|planning|studio|consult(?:ing|ants?)|associates|professional services)\b/i;

/** Permit data also holds individuals' names; only names that read like a business are kept. */
export const looksLikeCompany = (name: string) => COMPANY_WORDS.test(name) && !/^\d+\s*$/.test(name);
export const isDesignFirm = (name: string) => DESIGN_FIRM.test(name);

/** "Alteration" -> "Alteration to", so a permit title reads "Alteration to Terminal-Air in ...". */
export function workPhrase(work: string): string {
  const w = work.trim().toLowerCase() || "new";
  const phrase = w.charAt(0).toUpperCase() + w.slice(1);
  return /^(alteration|addition|interior alteration|exterior alteration)/.test(w) ? `${phrase} to` : phrase;
}

/** "Indust/Manufacture Misc." -> "Industrial Manufacture": the city's class names, tidied for a title. */
export const tidyClass = (label: string) => label.replace(/\bIndust\//i, "Industrial ").replace(/\s*Misc\.?$/i, "").replace(/\s+/g, " ").trim();

/** Reads CSV text into rows. Handles quoted fields, doubled quotes and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Plain text from a notice that may hold HTML. */
export const stripTags = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000);

export async function getJson(url: string, label: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SignalScout/1.0)", Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
    ...init,
  });
  if (!res.ok) throw new Error(`${label} returned ${res.status}`);
  return res.json();
}
