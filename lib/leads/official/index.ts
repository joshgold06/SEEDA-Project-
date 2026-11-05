import { fetchBcEao } from "./bceao";
import { fetchCanadaBuys } from "./canadabuys";
import { fetchCalgary } from "./calgary";
import { fetchEdmonton } from "./edmonton";
import { fetchIaac } from "./iaac";
import type { OfficialRecord, OfficialSource } from "./types";

export type { OfficialRecord, OfficialSource } from "./types";

export const OFFICIAL_SOURCES: Record<OfficialSource, { label: string; fetch: (now: Date) => Promise<OfficialRecord[]> }> = {
  iaac: { label: "federal impact assessments", fetch: fetchIaac },
  "bc-eao": { label: "BC environmental assessments", fetch: () => fetchBcEao() },
  "calgary-permits": { label: "Calgary permits", fetch: fetchCalgary },
  "edmonton-permits": { label: "Edmonton permits", fetch: fetchEdmonton },
  canadabuys: { label: "federal tender", fetch: fetchCanadaBuys },
};

export const fetchOfficial = (source: OfficialSource, now: Date = new Date()) => OFFICIAL_SOURCES[source].fetch(now);
