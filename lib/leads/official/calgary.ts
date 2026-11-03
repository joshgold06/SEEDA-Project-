import { formatMoney } from "../extract";
import { daysAgo, getJson, isDesignFirm, isoDate, looksLikeCompany, tidyClass, titleCase, workPhrase } from "./text";
import type { OfficialRecord } from "./types";

// City of Calgary building permits (open data, Socrata). Unlike most permit data it names the applicant and the
// contractor. Only industrial and utility classes (21xx to 25xx) over MIN_VALUE are read: houses, shops and
// offices are not EPCMst's work.
const DATASET = "https://data.calgary.ca/resource/c2es-76ed.json";
const PAGE = "https://data.calgary.ca/d/c2es-76ed";
const MIN_VALUE = 2_000_000;
const WINDOW_DAYS = 180;
// Parking garages and animal husbandry sit in the 2xxx range but are not industrial or utility work.
const SKIP_CLASSES = new Set(["2306", "2501"]);
const FIELDS = ["permitnum", "statuscurrent", "applieddate", "issueddate", "permitclass", "workclass", "description", "applicantname", "contractorname", "estprojectcost", "originaladdress", "communityname"];

interface CalgaryPermit {
  permitnum?: string;
  statuscurrent?: string;
  applieddate?: string;
  issueddate?: string;
  permitclass?: string;
  workclass?: string;
  description?: string;
  applicantname?: string;
  contractorname?: string;
  estprojectcost?: string;
  communityname?: string;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export function parseCalgary(rows: CalgaryPermit[]): OfficialRecord[] {
  const records: OfficialRecord[] = [];
  for (const r of rows) {
    const code = r.permitclass?.match(/^(\d{4})/)?.[1];
    const value = Number(r.estprojectcost);
    const when = r.issueddate ?? r.applieddate;
    if (!r.permitnum || !code || SKIP_CLASSES.has(code) || !Number.isFinite(value) || value < MIN_VALUE || !when) continue;
    const label = tidyClass(titleCase((r.permitclass ?? "").replace(/^\d{4}\s*-\s*/, "")));
    const work = (r.workclass ?? "New").trim();
    const community = r.communityname ? titleCase(r.communityname) : "";
    const applicant = r.applicantname ? titleCase(r.applicantname) : "";
    const contractor = r.contractorname ? titleCase(r.contractorname) : "";
    // An architect or engineer who files the permit is not the owner; the owner is then left unnamed.
    const owner = applicant && looksLikeCompany(applicant) && !isDesignFirm(applicant) ? applicant : null;
    const builder = contractor && looksLikeCompany(contractor) && contractor !== owner ? contractor : null;
    const description = (r.description ?? "").replace(/\s+/g, " ").trim();
    const issued = !!r.issueddate;
    records.push({
      origin: "Permit",
      source: "calgary-permits",
      recordId: r.permitnum,
      publisher: "City of Calgary building permits",
      title: `${workPhrase(work)} ${label}${community ? ` in ${community}` : ""}, Calgary: ${formatMoney(value)} building permit`,
      link: PAGE,
      date: new Date(when).toISOString(),
      region: "Alberta",
      placeText: "Calgary",
      organization: owner,
      contractors: builder ? [builder] : [],
      category: label,
      description,
      value,
      sizeNote: "Estimated project cost on the permit",
      // The city's status already reads as a phrase ("Issued Permit", "Pending Plans Review Assignment").
      stage: r.statuscurrent ? titleCase(r.statuscurrent) : issued ? "Permit issued" : "Permit applied for",
      stageNote: `${issued ? "Issued" : "Applied"} ${day(when)}`,
      documentName: `Calgary building permit ${r.permitnum}`,
      overview: `Calgary building permit ${r.permitnum}: ${work.toLowerCase()} work classed as "${label}"${community ? ` in ${community}` : ""}, estimated at ${formatMoney(value)}. ${owner ? `Applicant: ${owner}. ` : applicant ? `Filed by ${applicant}${isDesignFirm(applicant) ? ", a design firm, so the owner is not named" : ""}. ` : "No applicant is named. "}${builder ? `Contractor on the permit: ${builder}. ` : "No contractor is named. "}${description ? `Permit description: ${description.slice(0, 500)}` : ""}`.trim(),
    });
  }
  return records;
}

export async function fetchCalgary(now: Date = new Date()): Promise<OfficialRecord[]> {
  const params = new URLSearchParams({
    $select: FIELDS.join(","),
    $where: `estprojectcost >= ${MIN_VALUE} AND applieddate >= '${isoDate(daysAgo(now, WINDOW_DAYS))}T00:00:00' AND permitclass like '2%'`,
    $order: "applieddate DESC",
    $limit: "300",
  });
  return parseCalgary((await getJson(`${DATASET}?${params}`, "Calgary's permit data")) as CalgaryPermit[]);
}
