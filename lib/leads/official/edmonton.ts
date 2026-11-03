import { formatMoney } from "../extract";
import { daysAgo, getJson, isoDate, titleCase, workPhrase } from "./text";
import type { OfficialRecord } from "./types";

// City of Edmonton general building permits (open data, Socrata). The dataset does not name the applicant or the
// contractor, so these leads have an unknown owner; they are kept because utility and plant work is EPCMst's field.
const DATASET = "https://data.edmonton.ca/resource/24uj-dj8v.json";
const PAGE = "https://data.edmonton.ca/d/24uj-dj8v";
const MIN_VALUE = 2_000_000;
const WINDOW_DAYS = 180;
// Warehouses and shops dominate this dataset; utility buildings and plant-style descriptions are the relevant slice.
const DESCRIPTION_TERMS = ["UTILITY", "SUBSTATION", "SUB-STATION", "TREATMENT", "PUMP", "POWER PLANT", "COGENERATION", "REFINERY", "PIPELINE", "BIOSOLIDS", "RESERVOIR", "LIFT STATION"];

interface EdmontonPermit {
  row_id?: string;
  issue_date?: string;
  job_description?: string;
  building_type?: string;
  work_type?: string;
  construction_value?: string;
  address?: string;
  neighbourhood?: string;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export function parseEdmonton(rows: EdmontonPermit[]): OfficialRecord[] {
  const records: OfficialRecord[] = [];
  for (const r of rows) {
    const value = Number(r.construction_value);
    if (!r.row_id || !r.issue_date || !Number.isFinite(value) || value < MIN_VALUE) continue;
    const type = titleCase((r.building_type ?? "Building").replace(/\s*\(\d+\)\s*$/, ""));
    const work = (r.work_type ?? "").replace(/^\(\d+\)\s*/, "").trim() || "New";
    const area = r.neighbourhood ? titleCase(r.neighbourhood) : "";
    const description = (r.job_description ?? "").replace(/\s+/g, " ").trim();
    records.push({
      origin: "Permit",
      source: "edmonton-permits",
      recordId: r.row_id,
      publisher: "City of Edmonton building permits",
      title: `${workPhrase(work)} ${type}${area ? ` in ${area}` : ""}, Edmonton: ${formatMoney(value)} building permit`,
      link: PAGE,
      date: new Date(r.issue_date).toISOString(),
      region: "Alberta",
      placeText: "Edmonton",
      organization: null,
      contractors: [],
      category: type,
      description,
      value,
      sizeNote: "Construction value on the permit",
      stage: "Permit issued",
      stageNote: `Issued ${day(r.issue_date)}`,
      documentName: `Edmonton building permit ${r.row_id}`,
      overview: `Edmonton building permit: ${work.toLowerCase()} work classed as "${type}"${area ? ` in ${area}` : ""}, valued at ${formatMoney(value)}${r.address ? ` (${r.address.trim()})` : ""}, issued ${day(r.issue_date)}. The city's data does not name the applicant or the contractor, so both still need confirming. ${description ? `Permit description: ${description.slice(0, 500)}` : ""}`.trim(),
    });
  }
  return records;
}

export async function fetchEdmonton(now: Date = new Date()): Promise<OfficialRecord[]> {
  const terms = DESCRIPTION_TERMS.map((t) => `upper(job_description) like '%${t}%'`).join(" OR ");
  const params = new URLSearchParams({
    $where: `construction_value >= ${MIN_VALUE} AND issue_date >= '${isoDate(daysAgo(now, WINDOW_DAYS))}T00:00:00' AND (building_type like 'Utility Buildings%' OR ${terms})`,
    $order: "issue_date DESC",
    $limit: "300",
  });
  return parseEdmonton((await getJson(`${DATASET}?${params}`, "Edmonton's permit data")) as EdmontonPermit[]);
}
