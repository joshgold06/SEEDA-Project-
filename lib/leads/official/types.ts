import type { Region } from "../taxonomy";

// Official registers and permit data are a second way into the same lead pipeline as news.
// Each source is read into an OfficialRecord; buildOfficialCandidate then scores it with the same
// factors as a headline, and LeadSchema decides whether it is allowed in.

export type OfficialSource = "iaac" | "bc-eao" | "calgary-permits" | "edmonton-permits";

export interface OfficialRecord {
  origin: "Regulatory" | "Permit";
  source: OfficialSource;
  /** Stable within its source, so one record keeps one lead from run to run. */
  recordId: string;
  /** Shown as the source on the lead, for example "Impact Assessment Agency of Canada". */
  publisher: string;
  title: string;
  link: string;
  /** ISO date the register gives, or null when it gives none. */
  date: string | null;
  region: Region | null;
  /** Free text to look for a town in. */
  placeText: string;
  /** The proponent or applicant as the register names it, or null. */
  organization: string | null;
  contractors: string[];
  /** The register's own category, such as "Mining Industry". */
  category: string;
  description: string;
  value?: number;
  /** Where the value came from, shown under the project size. */
  sizeNote?: string;
  stage: string;
  stageNote: string;
  documentName: string;
  overview: string;
}
