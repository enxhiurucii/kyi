// Lightweight text similarity used for:
//  - conflict detection (does this investor already back a startup like mine?)
//  - sector fit (how much of their portfolio is in my space?)
// No external AI needed, fully deterministic and explainable (we show matched terms).

const STOPWORDS = new Set(
  (
    "a an the and or for of to in on with by from at as is are be our we us your you it its that this " +
    "which who into using use used help helps helping make makes making new more most less all any " +
    "based driven powered first best better leading next via across over under between per than " +
    "company companies startup startups solution solutions product products service services " +
    "build builds building provide provides providing offer offers offering enable enables enabling " +
    "cut cuts reduce reduces reducing save saves saving get gets way ways people business businesses"
  ).split(/\s+/),
);

// Words that appear in almost every pitch: they count, but much less.
const GENERIC = new Set(
  "ai ml software platform app apps data saas tool tools b2b b2c smb sme api cloud digital automation automated smart tech technology".split(
    " ",
  ),
);

// Map variants to one canonical token.
const CANON: Record<string, string> = {
  optimisation: "optimization",
  optimise: "optimization",
  optimize: "optimization",
  optimizing: "optimization",
  optimising: "optimization",
  planning: "planning",
  planner: "planning",
  routing: "route",
  routes: "route",
  trucks: "truck",
  trucking: "truck",
  lorry: "truck",
  lorries: "truck",
  haulage: "truck",
  fleets: "fleet",
  vehicles: "vehicle",
  freight: "freight",
  shipping: "freight",
  shipment: "freight",
  shipments: "freight",
  cargo: "freight",
  carriers: "carrier",
  deliveries: "delivery",
  warehouses: "warehouse",
  warehousing: "warehouse",
  payments: "payment",
  pay: "payment",
  banking: "bank",
  banks: "bank",
  lending: "loan",
  loans: "loan",
  credit: "loan",
  invoices: "invoice",
  invoicing: "invoice",
  healthcare: "health",
  medical: "health",
  clinical: "clinic",
  clinics: "clinic",
  patients: "patient",
  hospitals: "hospital",
  energy: "energy",
  batteries: "battery",
  carbon: "carbon",
  emissions: "carbon",
  co2: "carbon",
  climate: "climate",
  cleantech: "climate",
  developers: "developer",
  devtools: "developer",
  engineers: "developer",
  security: "security",
  cybersecurity: "security",
  retailers: "retail",
  ecommerce: "retail",
  "e-commerce": "retail",
  shops: "retail",
  stores: "retail",
  robots: "robot",
  robotics: "robot",
  sensors: "sensor",
  kilometres: "kilometre",
  kilometers: "kilometre",
  km: "kilometre",
  kms: "kilometre",
  restaurants: "restaurant",
  kitchens: "kitchen",
  games: "game",
  gaming: "game",
  learning: "learning",
  education: "education",
  edtech: "education",
  students: "student",
  schools: "school",
  hiring: "recruiting",
  recruitment: "recruiting",
  recruiters: "recruiting",
  insurers: "insurance",
  insurtech: "insurance",
};

/** Keyword → sector mapping, used to infer the sector(s) of a free-text startup description. */
export const SECTOR_KEYWORDS: Record<string, string[]> = {
  logistics: ["logistic", "logistics", "freight", "truck", "fleet", "delivery", "warehouse", "route", "carrier", "supply", "chain", "last-mile", "courier"],
  mobility: ["mobility", "vehicle", "ev", "charging", "car", "scooter", "transport", "transit"],
  fintech: ["fintech", "payment", "bank", "loan", "invoice", "finance", "accounting", "expense", "insurance", "wealth", "trading"],
  health: ["health", "clinic", "patient", "hospital", "therapy", "diagnostic", "biotech", "drug", "care", "wellbeing", "mental"],
  climate: ["climate", "energy", "battery", "carbon", "solar", "wind", "hydrogen", "grid", "recycling", "circular", "sustainability"],
  devtools: ["developer", "code", "devops", "observability", "database", "infrastructure", "api"],
  security: ["security", "identity", "fraud", "privacy", "compliance"],
  retail: ["retail", "commerce", "consumer", "brand", "marketplace", "shopping"],
  food: ["food", "restaurant", "kitchen", "grocery", "agri", "agriculture", "farm"],
  hr: ["recruiting", "hr", "talent", "payroll", "workforce", "employee"],
  education: ["education", "student", "school", "learning", "course"],
  deeptech: ["quantum", "semiconductor", "photonics", "space", "satellite", "robot", "materials", "sensor"],
  gaming: ["game", "esports", "metaverse"],
};

export function tokenize(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/[^a-z0-9äöåæø\s-]/g, " ")
    .split(/[\s/]+/)
    .filter(Boolean);
  const out: string[] = [];
  for (let t of raw) {
    t = t.replace(/^-+|-+$/g, "");
    if (t.length < 2 || STOPWORDS.has(t)) continue;
    if (CANON[t]) {
      out.push(CANON[t]);
      continue;
    }
    // naive plural stripping
    if (t.length > 4 && t.endsWith("s") && !t.endsWith("ss")) {
      const s = t.slice(0, -1);
      out.push(CANON[s] ?? s);
      continue;
    }
    out.push(t);
  }
  return out;
}

function weight(token: string): number {
  return GENERIC.has(token) ? 0.3 : 1;
}

/** Weighted set-cosine similarity in [0,1] plus the terms that matched. */
export function similarity(a: string, b: string): { score: number; matched: string[] } {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size === 0 || B.size === 0) return { score: 0, matched: [] };
  let inter = 0;
  const matched: string[] = [];
  for (const t of A) {
    if (B.has(t)) {
      inter += weight(t);
      matched.push(t);
    }
  }
  let na = 0;
  let nb = 0;
  for (const t of A) na += weight(t);
  for (const t of B) nb += weight(t);
  const score = inter / Math.sqrt(na * nb);
  // Sort matched terms: specific words first
  matched.sort((x, y) => weight(y) - weight(x));
  return { score: Math.min(1, score), matched };
}

/** Infer sectors from free text (best effort). */
export function inferSectors(text: string): string[] {
  const tokens = new Set(tokenize(text));
  const lowered = text.toLowerCase();
  const hits: { sector: string; n: number }[] = [];
  for (const [sector, words] of Object.entries(SECTOR_KEYWORDS)) {
    let n = 0;
    for (const w of words) {
      if (tokens.has(w) || (w.includes("-") && lowered.includes(w))) n++;
    }
    if (n > 0) hits.push({ sector, n });
  }
  hits.sort((x, y) => y.n - x.n);
  return hits.map((h) => h.sector);
}

export function normalizeSector(s: string): string {
  const inferred = inferSectors(s);
  return inferred[0] ?? s.trim().toLowerCase();
}
