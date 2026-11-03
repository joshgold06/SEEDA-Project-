import { detectValue, formatMoney } from "../extract";
import { ACTIVE_REGIONS, REGION_ABBR, type Region } from "../taxonomy";
import { daysAgo, getJson, isoDate } from "./text";
import type { OfficialRecord } from "./types";

// Impact Assessment Agency of Canada: every federal assessment, with the proponent named by the proponent
// itself. Published as a public ArcGIS service on geo.ca ("In progress" is layer 1); no key is needed.
const LAYER = "https://maps-cartes.services.geo.ca/server_serveur/rest/services/IAAC/assessment_inventory_en/MapServer/1/query";
const FIELDS = ["project_id", "project_cat_en", "project_name_en", "proponent_en", "province_codes", "location_en", "responsible_authority_en", "project_url_en", "start_date", "project_state_en", "description_en"];
const WINDOW_DAYS = 120;

const CODE_TO_REGION = Object.fromEntries(Object.entries(REGION_ABBR).map(([region, code]) => [code, region as Region])) as Record<string, Region>;

interface IaacAttributes {
  project_id?: string;
  project_cat_en?: string;
  project_name_en?: string;
  proponent_en?: string;
  province_codes?: string;
  location_en?: string;
  responsible_authority_en?: string;
  project_url_en?: string;
  start_date?: string;
  project_state_en?: string;
  description_en?: string;
}

/** The first covered province named in a code list such as "ON;QC" or "AB, SK". */
function regionOf(codes: string | undefined): Region | null {
  const listed = (codes ?? "").toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  return ACTIVE_REGIONS.find((r) => listed.includes(REGION_ABBR[r])) ?? (listed.map((c) => CODE_TO_REGION[c]).find(Boolean) ?? null);
}

export function parseIaac(json: unknown): OfficialRecord[] {
  const features = (json as { features?: { attributes?: IaacAttributes }[] } | null)?.features ?? [];
  const records: OfficialRecord[] = [];
  for (const f of features) {
    const a = f.attributes;
    if (!a?.project_id || !a.project_name_en) continue;
    const description = (a.description_en ?? "").replace(/\s+/g, " ").trim();
    const value = detectValue(description.slice(0, 1500));
    const date = a.start_date && !Number.isNaN(Date.parse(a.start_date)) ? new Date(a.start_date).toISOString() : null;
    records.push({
      origin: "Regulatory",
      source: "iaac",
      recordId: String(a.project_id),
      publisher: "Impact Assessment Agency of Canada",
      title: a.project_name_en.replace(/\s+/g, " ").trim(),
      link: a.project_url_en?.startsWith("http") ? a.project_url_en : `https://iaac-aeic.gc.ca/050/evaluations/proj/${a.project_id}`,
      date,
      region: regionOf(a.province_codes),
      placeText: `${a.location_en ?? ""} ${a.project_name_en} ${description.slice(0, 400)}`,
      organization: a.proponent_en?.replace(/\s+/g, " ").trim() || null,
      contractors: [],
      category: a.project_cat_en ?? "",
      description,
      value,
      sizeNote: value ? "Parsed from the registry description" : undefined,
      stage: `Federal assessment ${(a.project_state_en ?? "in progress").toLowerCase()}`,
      stageNote: a.responsible_authority_en ? `Authority: ${a.responsible_authority_en}` : "via the Canadian Impact Assessment Registry",
      documentName: `Impact Assessment Registry, project ${a.project_id}`,
      overview: `Listed on the Canadian Impact Assessment Registry${date ? ` on ${new Date(date).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}` : ""}. Proponent: ${a.proponent_en ?? "not given"}. ${a.responsible_authority_en ? `Responsible authority: ${a.responsible_authority_en}. ` : ""}${description ? `The registry describes it as: ${description.slice(0, 700)}${description.length > 700 ? "…" : ""}` : "The registry gives no description."}${value ? ` It mentions a value of ${formatMoney(value)}.` : ""}`,
    });
  }
  return records;
}

export async function fetchIaac(now: Date = new Date()): Promise<OfficialRecord[]> {
  const provinces = ACTIVE_REGIONS.map((r) => `province_codes LIKE '%${REGION_ABBR[r]}%'`).join(" OR ");
  const params = new URLSearchParams({
    where: `(${provinces}) AND start_date >= '${isoDate(daysAgo(now, WINDOW_DAYS))}'`,
    outFields: FIELDS.join(","),
    returnGeometry: "false",
    orderByFields: "start_date DESC",
    resultRecordCount: "500",
    f: "json",
  });
  const json = await getJson(`${LAYER}?${params}`, "The Impact Assessment registry");
  const error = (json as { error?: { message?: string } } | null)?.error;
  if (error) throw new Error(`The Impact Assessment registry said: ${error.message ?? "an error"}`);
  return parseIaac(json);
}
