import type { Opportunity } from "../data";
import { REGION_ABBR, type WesternRegion } from "./taxonomy";

// Approximate coordinates [lat, lng] for every place name the extractor can produce
// (see REGION_TERMS in taxonomy.ts). Accurate to a few kilometres, which is plenty
// for a province-scale map.
export const PLACES: Record<string, [number, number]> = {
  // Alberta
  "Fort McMurray": [56.73, -111.38], "Medicine Hat": [50.04, -110.68], "Red Deer": [52.27, -113.81],
  "Grande Prairie": [55.17, -118.8], "Fort Saskatchewan": [53.71, -113.21], Calgary: [51.05, -114.07],
  Edmonton: [53.55, -113.49], Lethbridge: [49.69, -112.84], "Cold Lake": [54.46, -110.18],
  "Drayton Valley": [53.22, -114.98], Airdrie: [51.29, -114.01], Leduc: [53.26, -113.55],
  "Strathcona County": [53.53, -113.15], "Rocky Mountain House": [52.38, -114.92], "Fort McKay": [57.19, -111.64],
  "Fort Chipewyan": [58.72, -111.15], "St. Albert": [53.63, -113.63], "Sherwood Park": [53.54, -113.3],
  "Spruce Grove": [53.55, -113.92], Cochrane: [51.19, -114.47], Okotoks: [50.73, -113.98], Brooks: [50.56, -111.9],
  Camrose: [53.02, -112.83], Canmore: [51.09, -115.36], Banff: [51.18, -115.57], Hinton: [53.4, -117.58],
  Whitecourt: [54.14, -115.69], "Peace River": [56.23, -117.29], Bonnyville: [54.27, -110.74],
  "Lac La Biche": [54.77, -111.97], Wetaskiwin: [52.97, -113.37], "Pincher Creek": [49.49, -113.95],
  // British Columbia
  "Fort St. John": [56.25, -120.85], "Prince George": [53.92, -122.75], Kitimat: [54.05, -128.65],
  Vancouver: [49.28, -123.12], Victoria: [48.43, -123.37], Burnaby: [49.25, -122.98], Kelowna: [49.89, -119.5],
  Squamish: [49.7, -123.16], Surrey: [49.19, -122.85], Abbotsford: [49.05, -122.31], Nanaimo: [49.17, -123.94],
  Coquitlam: [49.28, -122.79], Kamloops: [50.67, -120.33], "Prince Rupert": [54.31, -130.32],
  "Dawson Creek": [55.76, -120.24], "Fort Nelson": [58.81, -122.7], Delta: [49.15, -123.06],
  "Northeast BC": [56.0, -121.5],
  // Saskatchewan
  Saskatoon: [52.13, -106.67], Regina: [50.45, -104.61], Estevan: [49.14, -102.99], Weyburn: [49.66, -103.85],
  Lloydminster: [53.28, -110.0], "Moose Jaw": [50.39, -105.53], "Prince Albert": [53.2, -105.75],
  "Swift Current": [50.29, -107.79], Yorkton: [51.21, -102.46], "North Battleford": [52.78, -108.3],
};

// Used when a lead names a province but no specific place.
export const PROVINCE_ANCHOR: Record<WesternRegion, [number, number]> = {
  Alberta: [57.2, -114.9],
  "British Columbia": [57.0, -127.6],
  Saskatchewan: [57.2, -106],
};

const REGION_FROM_ABBR = Object.fromEntries(Object.entries(REGION_ABBR).map(([region, abbr]) => [abbr, region])) as Record<string, WesternRegion>;
const REGION_NAMES = Object.keys(REGION_ABBR) as WesternRegion[];

export interface MapPlace {
  key: string;
  label: string;
  region: WesternRegion;
  lat: number;
  lng: number;
  /** True when the lead names only a province, so the pin marks the province as a whole. */
  provinceWide: boolean;
}

/** Where a lead belongs on the map, from the location text the extractor wrote. */
export function placeFor(o: Opportunity): MapPlace | null {
  const withPlace = o.location.match(/^(.*), (AB|BC|SK)$/);
  if (withPlace) {
    const region = REGION_FROM_ABBR[withPlace[2]];
    const coords = PLACES[withPlace[1]];
    if (region && coords) return { key: withPlace[1], label: withPlace[1], region, lat: coords[0], lng: coords[1], provinceWide: false };
    if (region) return provinceWide(region);
  }
  const region = REGION_NAMES.find((r) => r === o.location);
  return region ? provinceWide(region) : null;
}

function provinceWide(region: WesternRegion): MapPlace {
  const [lat, lng] = PROVINCE_ANCHOR[region];
  return { key: `${region}:province`, label: `${region} (no specific place)`, region, lat, lng, provinceWide: true };
}

// --- Projection and outlines -------------------------------------------------

export const MAP_W = 928;
export const MAP_H = 520;
const LNG0 = -140;
const LAT0 = 61;
const SCALE_Y = 40;
const SCALE_X = SCALE_Y * Math.cos((54.5 * Math.PI) / 180); // shrink longitude at this latitude

export const project = (lat: number, lng: number): [number, number] => [(lng - LNG0) * SCALE_X, (LAT0 - lat) * SCALE_Y];

// Simplified province outlines as [lat, lng] rings. Stylised on purpose: this is an
// orientation aid for the pins, not a survey map.
export const OUTLINES: Record<WesternRegion, [number, number][]> = {
  "British Columbia": [
    [60, -139.05], [60, -120], [53.8, -120], [52.9, -118.9], [51.8, -116.9], [50.9, -115.6], [49.8, -114.6], [49, -114.07],
    [49, -123.3], [48.4, -123.4], [48.4, -124.7], [49.3, -126.2], [50.8, -128.4], [51.6, -127.8], [52.6, -128.8],
    [54.0, -130.4], [54.7, -130.6], [55.9, -130.0], [57.5, -130.7], [58.8, -133.6], [59.9, -136.5],
  ],
  Alberta: [[49, -114.07], [49, -110], [60, -110], [60, -120], [53.8, -120], [52.9, -118.9], [51.8, -116.9], [50.9, -115.6], [49.8, -114.6]],
  Saskatchewan: [[49, -110], [49, -101.4], [60, -102], [60, -110]],
};

export const outlinePath = (region: WesternRegion) =>
  OUTLINES[region].map(([lat, lng], i) => `${i === 0 ? "M" : "L"}${project(lat, lng).map((n) => n.toFixed(1)).join(",")}`).join(" ") + " Z";

// Cities drawn as small reference labels so the pins have something to be read against.
export const REFERENCE_CITIES = ["Calgary", "Edmonton", "Fort McMurray", "Vancouver", "Prince George", "Kitimat", "Fort St. John", "Regina", "Saskatoon", "Grande Prairie"];

export interface ViewBox { x: number; y: number; w: number; h: number }

/** A viewBox covering a lat/lng rectangle, padded and matched to the map's aspect ratio. */
export function fitBox(latMin: number, latMax: number, lngMin: number, lngMax: number, pad = 0.06): ViewBox {
  const [x0, y1] = project(latMin, lngMin);
  const [x1, y0] = project(latMax, lngMax);
  let w = (x1 - x0) * (1 + pad * 2);
  let h = (y1 - y0) * (1 + pad * 2);
  const aspect = MAP_W / MAP_H;
  if (w / h < aspect) w = h * aspect;
  else h = w / aspect;
  return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
}

// The Vancouver area packs Vancouver, Burnaby, Surrey, Coquitlam, Delta, Squamish and Abbotsford
// into a few millimetres at province scale, so it gets a close-up view of its own.
export const LOWER_MAINLAND = { latMin: 48.95, latMax: 49.85, lngMin: -123.4, lngMax: -122.1 };
export const inLowerMainland = (p: Pick<MapPlace, "lat" | "lng">) =>
  p.lat >= LOWER_MAINLAND.latMin && p.lat <= LOWER_MAINLAND.latMax && p.lng >= LOWER_MAINLAND.lngMin && p.lng <= LOWER_MAINLAND.lngMax;

export type MapFocus = "all" | WesternRegion | "Lower Mainland";

export const FOCUS_BOXES: Record<MapFocus, ViewBox> = {
  all: fitBox(48.2, 60.4, -139.5, -100.5, 0.02),
  Alberta: fitBox(48.8, 60.2, -120.4, -109.6),
  "British Columbia": fitBox(48.2, 60.2, -139.5, -113.5),
  Saskatchewan: fitBox(48.8, 60.2, -110.4, -101.2),
  "Lower Mainland": fitBox(LOWER_MAINLAND.latMin, LOWER_MAINLAND.latMax, LOWER_MAINLAND.lngMin, LOWER_MAINLAND.lngMax, 0.04),
};
