import { ACTIVE_REGIONS, type Region } from "../taxonomy";
import { parseCsv, stripTags } from "./text";
import type { OfficialRecord } from "./types";

// CanadaBuys: federal tender notices, published as one CSV of every open notice under the Open Government Licence
// (no key). Most notices are national supply arrangements or goods, so only construction and services notices that
// deliver to a covered province, and name no more than a few regions, are kept.
const FILE = "https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv";
const NATIONWIDE_AT = 6; // a notice listing this many regions is not about one place
const DESCRIPTION_CHARS = 1500;
// Rosters of pre-approved suppliers rather than a project.
const SKIP_NOTICE_TYPES = /supply arrangement|standing offer|not applicable/i;

const PROVINCE_NAMES: [RegExp, Region][] = [
  [/^alberta$/i, "Alberta"],
  [/^british columbia$/i, "British Columbia"],
  [/^saskatchewan$/i, "Saskatchewan"],
  [/^manitoba$/i, "Manitoba"],
  [/^ontario\b/i, "Ontario"],
];

/** "*Alberta\n*Ontario (except NCR)" -> the list of region names. */
const regionList = (cell: string) => cell.split(/\r?\n/).map((s) => s.replace(/^\*/, "").trim()).filter(Boolean);

export function parseCanadaBuys(csv: string, now: Date = new Date()): OfficialRecord[] {
  const rows = parseCsv(csv);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.replace(/^﻿/, ""));
  const at = (prefix: string) => head.findIndex((h) => h.startsWith(prefix));
  const col = {
    title: at("title-titre-eng"),
    ref: at("referenceNumber"),
    published: at("publicationDate"),
    closing: at("tenderClosingDate"),
    status: at("tenderStatus-appelOffresStatut-eng"),
    gsin: at("gsinDescription-nibsDescription-eng"),
    category: at("procurementCategory"),
    noticeType: at("noticeType-avisType-eng"),
    delivery: at("regionsOfDelivery-regionsLivraison-eng"),
    entity: at("contractingEntityName-nomEntitContractante-eng"),
    url: at("noticeURL-URLavis-eng"),
    description: at("tenderDescription-descriptionAppelOffres-eng"),
  };
  if (Object.values(col).some((i) => i < 0)) return []; // the file's layout changed: better nothing than wrong fields

  const records: OfficialRecord[] = [];
  const seen = new Set<string>();
  for (const r of rows.slice(1)) {
    if (r.length < head.length - 5) continue;
    const ref = r[col.ref]?.trim();
    const title = r[col.title]?.replace(/\s+/g, " ").trim();
    const closes = Date.parse(r[col.closing]);
    const published = Date.parse(r[col.published]);
    if (!ref || !title || seen.has(ref) || !/open/i.test(r[col.status] ?? "") || Number.isNaN(closes) || closes <= now.getTime()) continue;
    if (!/\*(CNST|SRV)\b/.test(r[col.category] ?? "") || SKIP_NOTICE_TYPES.test(r[col.noticeType] ?? "")) continue;
    const regions = regionList(r[col.delivery] ?? "");
    if (regions.length >= NATIONWIDE_AT) continue;
    const provinces = ACTIVE_REGIONS.filter((p) => regions.some((name) => PROVINCE_NAMES.some(([re, region]) => region === p && re.test(name))));
    if (!provinces.length) continue;
    seen.add(ref);

    const description = stripTags(r[col.description] ?? "").slice(0, DESCRIPTION_CHARS);
    const entity = (r[col.entity] ?? "").replace(/\s+/g, " ").trim().replace(/\s*\([A-Z&-]{2,10}\)\s*$/, "") || null;
    const gsin = (r[col.gsin] ?? "").replace(/\s+/g, " ").trim();
    const daysLeft = Math.ceil((closes - now.getTime()) / 86_400_000);
    const closesOn = new Date(closes).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    const url = r[col.url]?.trim();
    records.push({
      origin: "Tender",
      source: "canadabuys",
      recordId: ref,
      publisher: "CanadaBuys",
      title,
      link: url?.startsWith("http") ? url : "https://canadabuys.canada.ca/en/tender-opportunities",
      date: Number.isNaN(published) ? null : new Date(published).toISOString(),
      closes: new Date(closes).toISOString(),
      region: provinces[0],
      placeText: `${title} ${description.slice(0, 400)}`,
      organization: entity,
      contractors: [],
      category: gsin,
      description,
      stage: r[col.noticeType]?.trim() || "Open tender",
      stageNote: `Closes ${closesOn} (${daysLeft} day${daysLeft === 1 ? "" : "s"})`,
      documentName: `CanadaBuys notice ${ref}`,
      overview: `Federal tender notice ${ref} on CanadaBuys. Buyer: ${entity ?? "not named"}. Closes ${closesOn}. ${gsin ? `Category: ${gsin}. ` : ""}Delivery: ${regions.join(", ")}. ${description ? `Notice text: ${description}` : "The notice has no description."}`,
    });
  }
  return records;
}

export async function fetchCanadaBuys(now: Date = new Date()): Promise<OfficialRecord[]> {
  // The file is about 6 MB and replaced daily; it is read once per scan and filtered straight away.
  const res = await fetch(FILE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; SignalScout/1.0)" }, signal: AbortSignal.timeout(20000), cache: "no-store" });
  if (!res.ok) throw new Error(`CanadaBuys returned ${res.status}`);
  return parseCanadaBuys(await res.text(), now);
}
