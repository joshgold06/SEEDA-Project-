import type { Opportunity } from "../data";
import { REGION_ABBR, type Region } from "./taxonomy";

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
  // Manitoba
  Winnipeg: [49.9, -97.14], "Flin Flon": [54.77, -101.88], "The Pas": [53.82, -101.25], "Portage la Prairie": [49.97, -98.29],
  Steinbach: [49.53, -96.68], Selkirk: [50.14, -96.88], "Lynn Lake": [56.85, -101.05], Churchill: [58.77, -94.17],
  "Northern Manitoba": [56.5, -96.5],
  // Ontario
  Toronto: [43.65, -79.38], Ottawa: [45.42, -75.7], Mississauga: [43.59, -79.64], Hamilton: [43.26, -79.87],
  Sudbury: [46.49, -81.0], "Thunder Bay": [48.38, -89.25], Sarnia: [42.97, -82.4], Niagara: [43.1, -79.07],
  Oshawa: [43.9, -78.86], Pickering: [43.84, -79.09], Kincardine: [44.18, -81.63], Timmins: [48.48, -81.33],
  "Sault Ste. Marie": [46.52, -84.35], Brampton: [43.73, -79.76], Markham: [43.86, -79.34], Oakville: [43.45, -79.68],
  Barrie: [44.39, -79.69], Guelph: [43.54, -80.25], Welland: [42.99, -79.25], "Ring of Fire": [52.9, -86.3],
  "Northern Ontario": [49.5, -84.0],
};

// Used when a lead names a province but no specific place.
export const PROVINCE_ANCHOR: Record<Region, [number, number]> = {
  Alberta: [57.2, -114.9],
  "British Columbia": [57.0, -127.6],
  // Staggered in latitude so the pills beside each other don't overlap on the whole-map view.
  Saskatchewan: [54.8, -106],
  Manitoba: [57.6, -98.6],
  Ontario: [51.5, -86.5],
};

const REGION_FROM_ABBR = Object.fromEntries(Object.entries(REGION_ABBR).map(([region, abbr]) => [abbr, region])) as Record<string, Region>;
const REGION_NAMES = Object.keys(REGION_ABBR) as Region[];

/** The province a lead belongs to, read from the location text the extractor wrote ("Calgary, AB" or "Alberta"). */
export function regionOf(o: Pick<Opportunity, "location">): Region | null {
  const withAbbr = o.location.match(/, (AB|BC|SK|MB|ON)$/);
  if (withAbbr) return REGION_FROM_ABBR[withAbbr[1]] ?? null;
  return REGION_NAMES.find((r) => r === o.location) ?? null;
}

export interface MapPlace {
  key: string;
  label: string;
  region: Region;
  lat: number;
  lng: number;
  /** True when the lead names only a province, so the pin marks the province as a whole. */
  provinceWide: boolean;
}

/** Where a lead belongs on the map, from the location text the extractor wrote. */
export function placeFor(o: Opportunity): MapPlace | null {
  const withPlace = o.location.match(/^(.*), (AB|BC|SK|MB|ON)$/);
  if (withPlace) {
    const region = REGION_FROM_ABBR[withPlace[2]];
    const coords = PLACES[withPlace[1]];
    if (region && coords) return { key: withPlace[1], label: withPlace[1], region, lat: coords[0], lng: coords[1], provinceWide: false };
    if (region) return provinceWide(region);
  }
  const region = REGION_NAMES.find((r) => r === o.location);
  return region ? provinceWide(region) : null;
}

function provinceWide(region: Region): MapPlace {
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
export const OUTLINES: Record<Region, [number, number][]> = {
  "British Columbia": [
    [60, -139.05], [60, -120], [53.8, -120], [52.9, -118.9], [51.8, -116.9], [50.9, -115.6], [49.8, -114.6], [49, -114.07],
    [49, -123.3], [48.4, -123.4], [48.4, -124.7], [49.3, -126.2], [50.8, -128.4], [51.6, -127.8], [52.6, -128.8],
    [54.0, -130.4], [54.7, -130.6], [55.9, -130.0], [57.5, -130.7], [58.8, -133.6], [59.9, -136.5],
  ],
  Alberta: [[49, -114.07], [49, -110], [60, -110], [60, -120], [53.8, -120], [52.9, -118.9], [51.8, -116.9], [50.9, -115.6], [49.8, -114.6]],
  Saskatchewan: [[49, -110], [49, -101.4], [60, -102], [60, -110]],
  Manitoba: [[49, -101.4], [49, -95.15], [53, -95.15], [56.85, -92.2], [58.8, -94.3], [60, -94.8], [60, -102]],
  // Lakes Superior, Huron, Erie and Ontario are drawn as straight edges; this is an orientation aid.
  Ontario: [
    [49, -95.15], [53, -95.15], [56.85, -92.2], [55.3, -82.3], [51.3, -80.5], [48, -79.5], [46.3, -79.5], [45.5, -75.5],
    [45, -74.7], [44.1, -76.3], [43.6, -79.5], [42.8, -80], [42.05, -82.5], [42.3, -83.1], [43, -82.4], [44.4, -81.7],
    [45.3, -81.3], [46.3, -84], [46.5, -84.4], [47, -84.9], [48.7, -88.4], [48.3, -89.3], [48, -89.6], [48.3, -92], [49, -94.7],
  ],
};

export const outlinePath = (region: Region) =>
  OUTLINES[region].map(([lat, lng], i) => `${i === 0 ? "M" : "L"}${project(lat, lng).map((n) => n.toFixed(1)).join(",")}`).join(" ") + " Z";

// Cities drawn as small reference labels so the pins have something to be read against.
export const REFERENCE_CITIES = ["Calgary", "Edmonton", "Fort McMurray", "Vancouver", "Prince George", "Kitimat", "Fort St. John", "Regina", "Saskatoon", "Grande Prairie", "Winnipeg", "Toronto", "Ottawa", "Sudbury", "Thunder Bay"];

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

export type MapFocus = "all" | Region | "Lower Mainland";

export const FOCUS_BOXES: Record<MapFocus, ViewBox> = {
  all: fitBox(41.8, 60.4, -139.5, -74, 0.02),
  Alberta: fitBox(48.8, 60.2, -120.4, -109.6),
  "British Columbia": fitBox(48.2, 60.2, -139.5, -113.5),
  Saskatchewan: fitBox(48.8, 60.2, -110.4, -101.2),
  Manitoba: fitBox(48.8, 60.2, -102.8, -93.2),
  Ontario: fitBox(41.8, 57.2, -95.8, -74.2),
  "Lower Mainland": fitBox(LOWER_MAINLAND.latMin, LOWER_MAINLAND.latMax, LOWER_MAINLAND.lngMin, LOWER_MAINLAND.lngMax, 0.04),
};
