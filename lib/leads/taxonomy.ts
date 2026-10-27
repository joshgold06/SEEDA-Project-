// Vocabulary for turning a news headline into a scored, explainable lead.
// Sources: the company's "Key Prospecting Signals" (three signal types) and
// Keywords.pdf (EPC terms). Generic words from that list ("audit", "claims",
// "design", "consultant") are left out on purpose: they match almost any headline.

export const REGIONS = ["Alberta", "British Columbia", "Saskatchewan", "Manitoba", "Ontario"] as const;
export type Region = (typeof REGIONS)[number];

// Regions leads are currently accepted from. Remove one here to narrow the
// search; place names for every region stay defined below.
export const ACTIVE_REGIONS: readonly Region[] = ["Alberta", "British Columbia", "Saskatchewan", "Manitoba", "Ontario"];

export const REGION_ABBR: Record<Region, string> = {
  Alberta: "AB",
  "British Columbia": "BC",
  Saskatchewan: "SK",
  Manitoba: "MB",
  Ontario: "ON",
};

/** Short names for sentences and chips: "Alberta, BC, Saskatchewan, Manitoba and Ontario". */
export const REGION_SHORT: Record<Region, string> = {
  Alberta: "Alberta",
  "British Columbia": "BC",
  Saskatchewan: "Saskatchewan",
  Manitoba: "Manitoba",
  Ontario: "Ontario",
};
export const ACTIVE_REGION_SENTENCE = (() => {
  const names = ACTIVE_REGIONS.map((r) => REGION_SHORT[r]);
  return names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
})();

// Longest/most specific terms first inside each region. Matched on word boundaries.
export const REGION_TERMS: Record<Region, { term: string; place?: string }[]> = {
  Alberta: [
    { term: "fort mcmurray", place: "Fort McMurray" },
    { term: "wood buffalo", place: "Fort McMurray" },
    { term: "medicine hat", place: "Medicine Hat" },
    { term: "red deer", place: "Red Deer" },
    { term: "grande prairie", place: "Grande Prairie" },
    { term: "fort saskatchewan", place: "Fort Saskatchewan" },
    { term: "calgary", place: "Calgary" },
    { term: "edmonton", place: "Edmonton" },
    { term: "lethbridge", place: "Lethbridge" },
    { term: "cold lake", place: "Cold Lake" },
    { term: "drayton valley", place: "Drayton Valley" },
    { term: "airdrie", place: "Airdrie" },
    { term: "leduc", place: "Leduc" },
    { term: "strathcona", place: "Strathcona County" },
    { term: "rocky mountain house", place: "Rocky Mountain House" },
    { term: "fort mckay", place: "Fort McKay" },
    { term: "fort chipewyan", place: "Fort Chipewyan" },
    { term: "st\\.? albert", place: "St. Albert" },
    { term: "sherwood park", place: "Sherwood Park" },
    { term: "spruce grove", place: "Spruce Grove" },
    { term: "cochrane", place: "Cochrane" },
    { term: "okotoks", place: "Okotoks" },
    { term: "brooks", place: "Brooks" },
    { term: "camrose", place: "Camrose" },
    { term: "canmore", place: "Canmore" },
    { term: "banff", place: "Banff" },
    { term: "hinton", place: "Hinton" },
    { term: "whitecourt", place: "Whitecourt" },
    { term: "peace river", place: "Peace River" },
    { term: "bonnyville", place: "Bonnyville" },
    { term: "lac la biche", place: "Lac La Biche" },
    { term: "wetaskiwin", place: "Wetaskiwin" },
    { term: "pincher creek", place: "Pincher Creek" },
    { term: "alberta" },
    { term: "oil sands" },
    { term: "alberta energy regulator" },
  ],
  "British Columbia": [
    { term: "fort st\\.? john", place: "Fort St. John" },
    { term: "prince george", place: "Prince George" },
    { term: "kitimat", place: "Kitimat" },
    { term: "vancouver", place: "Vancouver" },
    { term: "victoria", place: "Victoria" },
    { term: "burnaby", place: "Burnaby" },
    { term: "kelowna", place: "Kelowna" },
    { term: "squamish", place: "Squamish" },
    { term: "surrey", place: "Surrey" },
    { term: "abbotsford", place: "Abbotsford" },
    { term: "nanaimo", place: "Nanaimo" },
    { term: "coquitlam", place: "Coquitlam" },
    { term: "kamloops", place: "Kamloops" },
    { term: "prince rupert", place: "Prince Rupert" },
    { term: "dawson creek", place: "Dawson Creek" },
    { term: "fort nelson", place: "Fort Nelson" },
    { term: "tilbury", place: "Delta" },
    { term: "montney", place: "Northeast BC" },
    { term: "british columbia" },
    { term: "b\\.c\\." },
    { term: "bc" },
  ],
  Saskatchewan: [
    { term: "saskatoon", place: "Saskatoon" },
    { term: "regina", place: "Regina" },
    { term: "estevan", place: "Estevan" },
    { term: "weyburn", place: "Weyburn" },
    { term: "lloydminster", place: "Lloydminster" },
    { term: "moose jaw", place: "Moose Jaw" },
    { term: "prince albert", place: "Prince Albert" },
    { term: "swift current", place: "Swift Current" },
    { term: "yorkton", place: "Yorkton" },
    { term: "north battleford", place: "North Battleford" },
    { term: "saskatchewan" },
    { term: "sask\\." },
  ],
  // Ambiguous names (Windsor, Kingston, Brandon, Thompson, London) are left out on purpose:
  // a wrong province is worse than no town. The province name itself still places the lead.
  Manitoba: [
    { term: "winnipeg", place: "Winnipeg" },
    { term: "flin flon", place: "Flin Flon" },
    { term: "the pas", place: "The Pas" },
    { term: "portage la prairie", place: "Portage la Prairie" },
    { term: "steinbach", place: "Steinbach" },
    { term: "selkirk", place: "Selkirk" },
    { term: "lynn lake", place: "Lynn Lake" },
    { term: "port of churchill", place: "Churchill" },
    { term: "churchill, man", place: "Churchill" },
    { term: "keeyask", place: "Northern Manitoba" },
    { term: "bipole", place: "Northern Manitoba" },
    { term: "manitoba hydro" },
    { term: "manitoba" },
  ],
  Ontario: [
    { term: "toronto", place: "Toronto" },
    { term: "greater toronto", place: "Toronto" },
    { term: "ottawa", place: "Ottawa" },
    { term: "mississauga", place: "Mississauga" },
    { term: "hamilton", place: "Hamilton" },
    { term: "sudbury", place: "Sudbury" },
    { term: "thunder bay", place: "Thunder Bay" },
    { term: "sarnia", place: "Sarnia" },
    { term: "niagara", place: "Niagara" },
    { term: "oshawa", place: "Oshawa" },
    { term: "pickering", place: "Pickering" },
    { term: "kincardine", place: "Kincardine" },
    { term: "bruce power", place: "Kincardine" },
    { term: "timmins", place: "Timmins" },
    { term: "sault ste\\.? marie", place: "Sault Ste. Marie" },
    { term: "brampton", place: "Brampton" },
    { term: "markham", place: "Markham" },
    { term: "oakville", place: "Oakville" },
    { term: "barrie", place: "Barrie" },
    { term: "guelph", place: "Guelph" },
    { term: "welland", place: "Welland" },
    { term: "ring of fire", place: "Ring of Fire" },
    { term: "northern ontario", place: "Northern Ontario" },
    { term: "ontario power generation" },
    { term: "ontario" },
    { term: "ont\\." },
  ],
};

export const SIGNAL_TYPES = [
  "Contract award",
  "Regulatory milestone",
  "Operational scarcity",
  "Energy transition",
  "Project announcement",
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

// Points reflect how early the signal usually is relative to a public RFP.
export const SIGNAL_POINTS: Record<SignalType, number> = {
  "Contract award": 21, // a contractor is chosen, so there are named people to contact
  "Regulatory milestone": 22,
  "Operational scarcity": 20,
  "Energy transition": 18,
  "Project announcement": 14,
};

export const SIGNAL_PHASE_TAG: Record<SignalType, string> = {
  "Contract award": "Contract Award",
  "Regulatory milestone": "Regulatory",
  "Operational scarcity": "Operations",
  "Energy transition": "Energy Transition",
  "Project announcement": "Announcement",
};

export const SIGNAL_TERMS: Record<SignalType, string[]> = {
  "Contract award": [
    "awarded", "awards", "contract award", "contract", "selected", "selects",
    "epc contract", "epcm contract", "engineering contract", "feed contract", "front-end engineering",
    "lead contractor", "general contractor",
  ],
  "Regulatory milestone": [
    "regulatory approval", "approval", "approve", "approves", "approved", "environmental assessment",
    "impact assessment", "permit", "licence", "license", "application", "filing", "filed",
    "compliance", "alberta energy regulator", "aer", "canada energy regulator", "bc oil and gas commission",
    "environmental assessment office", "utilities commission",
  ],
  "Operational scarcity": [
    "turnaround", "shutdown", "outage", "pipeline integrity", "integrity management",
    "facility overhaul", "overhaul", "modular fabrication", "retrofit", "refurbish", "maintenance program",
  ],
  "Energy transition": [
    "hydrogen", "carbon capture", "ccus", "ccs", "lithium", "geothermal", "renewable",
    "small modular reactor", "smr", "grid", "transmission line", "solar", "wind farm", "biofuel", "net-zero",
  ],
  "Project announcement": [
    "expansion", "phase 2", "phase two", "new plant", "new facility", "construction", "construct",
    "upgrade", "capital project", "final investment decision", "fid", "investment", "build", "project",
    "funding", "grant", "loan", "tender", "rfp", "request for proposal", "request for qualifications", "rfq",
    "greenlight", "greenlights", "green-lights", "sanction", "breaks ground", "groundbreaking",
  ],
};

// High-signal subset of Keywords.pdf, plus SEEDA's mining and water work.
export const EPC_KEYWORDS: string[] = [
  "epc", "epcm", "engineering", "procurement", "construction management", "construction",
  "pipeline", "facilities", "facility", "turnaround", "carbon capture", "industrial water",
  "water treatment", "wastewater", "design-build", "capex", "capital project", "fabrication",
  "lng", "refinery", "gas plant", "oil sands", "petrochemical", "midstream", "upstream",
  "mine", "mining", "smelter", "potash", "lithium", "hydrogen", "infrastructure", "terminal",
];

export const INDUSTRY_TERMS: Record<string, string[]> = {
  Energy: ["oil", "gas", "lng", "pipeline", "refinery", "oil sands", "petrochemical", "midstream", "upstream", "hydrogen", "carbon capture", "ccus", "power plant", "grid", "energy", "geothermal", "terminal", "nuclear", "reactor", "hydroelectric", "hydro"],
  Mining: ["mine", "mining", "lithium", "potash", "uranium", "smelter", "coal", "copper", "gold", "nickel", "critical minerals", "ring of fire"],
  Water: ["water treatment", "wastewater", "water reuse", "water plant", "stormwater", "biosolids", "industrial water", "water infrastructure"],
  Infrastructure: ["bridge", "transit", "highway", "airport", "rail", "infrastructure", "overpass", "interchange", "subway", "light rail", "lrt", "port of", "harbour"],
};

/** The industry choices shown in the filters, in display order. */
export const INDUSTRIES = Object.keys(INDUSTRY_TERMS);

export const SERVICE_LINE: Record<string, string> = {
  Energy: "energy facilities and pipelines",
  Mining: "mining infrastructure",
  Water: "water and wastewater infrastructure",
  Infrastructure: "municipal and industrial infrastructure",
};

// Headlines that are about money markets or general news, not a buildable project.
export const NOISE_TERMS: string[] = [
  "earnings", "dividend", "stock", "shares", "price target", "analyst", "quarterly results",
  "buyback", "scholarship", "awards", "celebrating", "obituary", "hockey", "festival",
  "opinion", "editorial", "horoscope", "lottery", "recipe", "feature:", "front page", "podcast",
  "what it means", "explained", "should the", "ceo says", "interview", "column", "letters",
  "surplus", "deficit", "budget", "economist", "commentary", "byelection",
];

// Companies whose name alone tells us the industry, for headlines with no other industry word.
export const ORG_INDUSTRY: Record<string, string> = {
  Cenovus: "Energy", Suncor: "Energy", "Canadian Natural": "Energy", CNRL: "Energy", "Imperial Oil": "Energy",
  Pembina: "Energy", "Pembina Pipeline": "Energy", "TC Energy": "Energy", Enbridge: "Energy", "LNG Canada": "Energy",
  Shell: "Energy", Tourmaline: "Energy", "ARC Resources": "Energy", Keyera: "Energy", "Plains Midstream": "Energy",
  "Strathcona Resources": "Energy", "MEG Energy": "Energy", Ovintiv: "Energy", Whitecap: "Energy",
  "Capital Power": "Energy", TransAlta: "Energy", ATCO: "Energy", AltaGas: "Energy", "Woodfibre LNG": "Energy",
  "Cedar LNG": "Energy", "Ksi Lisims": "Energy", Petronas: "Energy", "Pathways Alliance": "Energy", Pathways: "Energy",
  "Trans Mountain": "Energy", "Coastal GasLink": "Energy", "Inter Pipeline": "Energy", Vermilion: "Energy",
  "Gibson Energy": "Energy", Parkland: "Energy", "Westcoast Energy": "Energy", "BC Hydro": "Energy", FortisBC: "Energy",
  "Wolf Midstream": "Energy", Tidewater: "Energy",
  Teck: "Mining", Nutrien: "Mining", Cameco: "Mining", BHP: "Mining", Mosaic: "Mining",
  "E3 Lithium": "Mining", "Arizona Lithium": "Mining",
  "Ontario Power Generation": "Energy", "Bruce Power": "Energy", "Hydro One": "Energy", "Manitoba Hydro": "Energy",
  Metrolinx: "Infrastructure", Hudbay: "Mining", Vale: "Mining", Glencore: "Mining", "Noront Resources": "Mining",
};

// Engineering and construction firms commonly named on major Western Canadian
// projects. Only names that appear in a headline are ever used.
export const KNOWN_CONTRACTORS: string[] = [
  "Fluor", "JGC", "Bechtel", "KBR", "Worley", "Jacobs Engineering", "AtkinsRéalis", "AtkinsRealis", "SNC-Lavalin",
  "Kiewit", "PCL", "Aecon", "Stantec", "WSP", "Wood Group", "Black & Veatch", "Hatch Ltd", "Ledcor",
  "Graham Construction", "Bird Construction", "Chiyoda", "Technip", "McDermott", "Matrix Service",
  "Associated Engineering", "Burns & McDonnell", "Zachry", "Primoris", "Mammoet", "Clark Builders",
  "Pomerleau", "Surespan", "Tetra Tech", "Hyundai Engineering", "Samsung E&A", "CB&I",
];

// Owners that are governments or regulators rather than private companies.
export const PUBLIC_OWNER_PATTERN = /\b(city of|town of|county of|municipal(?:ity)?|government of|province of|ministry|department of|federal|provincial|crown|regulator|commission|health authority|school (?:board|division))\b/i;

export const KNOWN_ORGANIZATIONS: string[] = [
  "Cenovus", "Suncor", "Canadian Natural", "CNRL", "Imperial Oil", "Pembina", "TC Energy", "Enbridge",
  "LNG Canada", "Shell", "Tourmaline", "ARC Resources", "Keyera", "Plains Midstream", "Strathcona Resources",
  "MEG Energy", "Ovintiv", "Whitecap", "Teck", "Nutrien", "Capital Power", "TransAlta", "ATCO", "AltaGas",
  "Woodfibre LNG", "Cedar LNG", "Ksi Lisims", "Petronas", "Pathways Alliance", "Air Products", "Dow",
  "Trans Mountain", "Coastal GasLink", "Inter Pipeline", "Vermilion", "Peyto", "Birchcliff", "Crescent Point",
  "Baytex", "Gibson Energy", "Parkland", "BHP", "Cameco", "Mosaic", "Westcoast Energy", "Pathways",
  "FortisBC", "E3 Lithium", "Arizona Lithium", "Pembina Pipeline", "Wolf Midstream", "Tidewater",
  "Alberta Energy Regulator", "Canada Energy Regulator", "BC Hydro", "Alberta Utilities Commission",
  "Government of Alberta", "Government of British Columbia", "Government of Saskatchewan",
  "Ontario Power Generation", "Bruce Power", "Hydro One", "Manitoba Hydro", "Metrolinx", "Infrastructure Ontario",
  "Hudbay", "Vale", "Glencore", "Noront Resources", "Government of Ontario", "Government of Manitoba",
];
