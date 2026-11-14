// Synthetic demo world: fictional Nordic investors, startups and funding rounds.
// Deterministic (seeded) and generated relative to "today", so the demo always looks fresh.
// Every name here is invented. The UI labels this data as synthetic.

import { slug } from "../format";
import { inferSectors } from "../similarity";
import type { Company, Investor, Participation, Round, Stage } from "../types";
import { STAGE_LABEL, STAGE_ORDER } from "../types";

interface Profile {
  name: string;
  country: string;
  kind: string;
  description: string;
  startMonthsAgo: number;
  activeUntilMonthsAgo: number;
  dealsPerYear: number;
  leadProb: number;
  followOnProb: number;
  quality: number; // graduation boost
  stages: Partial<Record<Stage, number>>;
  sectors: Record<string, number>;
  countries: Record<string, number>;
  background?: boolean;
}

const NORDICS = { Finland: 0.35, Sweden: 0.25, Denmark: 0.12, Norway: 0.12, Estonia: 0.1, Latvia: 0.03, Lithuania: 0.03 };
const BROAD = { logistics: 1, mobility: 1, fintech: 1, health: 1, climate: 1, devtools: 1, security: 0.6, retail: 0.6, food: 0.5, hr: 0.5, education: 0.4, deeptech: 0.6, gaming: 0.4 };

export const PROFILES: Profile[] = [
  {
    name: "Aurora Peak Capital",
    country: "Finland",
    kind: "VC fund",
    description: "Well-known Nordic early-stage fund (Fund II, 2019 vintage). Big brand, quieter lately.",
    startMonthsAgo: 84, activeUntilMonthsAgo: 14, dealsPerYear: 11, leadProb: 0.45, followOnProb: 0.08, quality: -0.12,
    stages: { seed: 0.6, "series-a": 0.4 },
    sectors: { logistics: 0.3, mobility: 0.2, devtools: 0.2, fintech: 0.2, climate: 0.1 },
    countries: { Finland: 0.5, Sweden: 0.2, Estonia: 0.15, Denmark: 0.15 },
  },
  {
    name: "Sisu Seed Partners",
    country: "Finland",
    kind: "VC fund",
    description: "Seed fund for Nordic B2B software, logistics and mobility tech. Typically leads.",
    startMonthsAgo: 66, activeUntilMonthsAgo: 0, dealsPerYear: 13, leadProb: 0.72, followOnProb: 0.6, quality: 0.22,
    stages: { "pre-seed": 0.2, seed: 0.7, "series-a": 0.1 },
    sectors: { logistics: 0.4, devtools: 0.2, mobility: 0.2, fintech: 0.1, climate: 0.1 },
    countries: { Finland: 0.55, Sweden: 0.15, Estonia: 0.15, Norway: 0.15 },
  },
  {
    name: "Lumo Ventures",
    country: "Sweden",
    kind: "VC fund",
    description: "Large multi-stage fund that joins many rounds across the Nordics.",
    startMonthsAgo: 84, activeUntilMonthsAgo: 0, dealsPerYear: 18, leadProb: 0.05, followOnProb: 0.35, quality: 0.05,
    stages: { seed: 0.4, "series-a": 0.4, "series-b": 0.2 },
    sectors: BROAD,
    countries: { Sweden: 0.4, Finland: 0.2, Denmark: 0.2, Norway: 0.2 },
  },
  {
    name: "Kide Capital",
    country: "Finland",
    kind: "VC fund",
    description: "Climate and energy transition fund, seed to Series A.",
    startMonthsAgo: 60, activeUntilMonthsAgo: 0, dealsPerYear: 8, leadProb: 0.55, followOnProb: 0.5, quality: 0.1,
    stages: { seed: 0.5, "series-a": 0.5 },
    sectors: { climate: 0.6, mobility: 0.2, food: 0.2 },
    countries: NORDICS,
  },
  {
    name: "Pohjola Growth Partners",
    country: "Finland",
    kind: "Growth fund",
    description: "Growth-stage fund writing large tickets from Series B onwards.",
    startMonthsAgo: 84, activeUntilMonthsAgo: 0, dealsPerYear: 6, leadProb: 0.6, followOnProb: 0.6, quality: 0.1,
    stages: { "series-b": 0.5, "series-c+": 0.4, growth: 0.1 },
    sectors: BROAD,
    countries: NORDICS,
  },
  {
    name: "Revontuli Angels",
    country: "Finland",
    kind: "Angel syndicate",
    description: "Syndicate of 120 Finnish angels backing very early founders.",
    startMonthsAgo: 84, activeUntilMonthsAgo: 0, dealsPerYear: 15, leadProb: 0.08, followOnProb: 0.12, quality: -0.05,
    stages: { "pre-seed": 0.8, seed: 0.2 },
    sectors: BROAD,
    countries: { Finland: 0.85, Estonia: 0.15 },
  },
  {
    name: "Amber Coast VC",
    country: "Estonia",
    kind: "VC fund",
    description: "Baltic seed fund focused on fintech and B2B SaaS.",
    startMonthsAgo: 72, activeUntilMonthsAgo: 0, dealsPerYear: 9, leadProb: 0.5, followOnProb: 0.4, quality: 0.05,
    stages: { "pre-seed": 0.3, seed: 0.6, "series-a": 0.1 },
    sectors: { fintech: 0.4, devtools: 0.25, security: 0.2, hr: 0.15 },
    countries: { Estonia: 0.5, Latvia: 0.2, Lithuania: 0.2, Finland: 0.1 },
  },
  {
    name: "Helix Health Fund",
    country: "Denmark",
    kind: "VC fund",
    description: "Specialist healthtech and digital health investor.",
    startMonthsAgo: 72, activeUntilMonthsAgo: 0, dealsPerYear: 7, leadProb: 0.6, followOnProb: 0.5, quality: 0.08,
    stages: { seed: 0.4, "series-a": 0.6 },
    sectors: { health: 0.9, hr: 0.1 },
    countries: { Denmark: 0.4, Sweden: 0.3, Finland: 0.15, Norway: 0.15 },
  },
  {
    name: "Glacier Deep Tech",
    country: "Finland",
    kind: "VC fund",
    description: "Deep-tech fund for university spin-outs in hardware, photonics and quantum.",
    startMonthsAgo: 72, activeUntilMonthsAgo: 8, dealsPerYear: 6, leadProb: 0.5, followOnProb: 0.45, quality: 0.05,
    stages: { seed: 0.5, "series-a": 0.5 },
    sectors: { deeptech: 0.7, climate: 0.3 },
    countries: { Finland: 0.6, Sweden: 0.2, Norway: 0.2 },
  },
  {
    name: "Saimaa Seed",
    country: "Finland",
    kind: "VC fund",
    description: "Small regional seed fund for food, climate and education startups.",
    startMonthsAgo: 60, activeUntilMonthsAgo: 0, dealsPerYear: 6, leadProb: 0.6, followOnProb: 0.3, quality: 0,
    stages: { "pre-seed": 0.4, seed: 0.6 },
    sectors: { food: 0.3, climate: 0.3, education: 0.2, retail: 0.2 },
    countries: { Finland: 0.9, Estonia: 0.1 },
  },
  {
    name: "Øresund Crest Ventures",
    country: "Denmark",
    kind: "VC fund",
    description: "Copenhagen-based Series A investor in SaaS and fintech.",
    startMonthsAgo: 72, activeUntilMonthsAgo: 0, dealsPerYear: 8, leadProb: 0.45, followOnProb: 0.4, quality: 0.05,
    stages: { seed: 0.3, "series-a": 0.7 },
    sectors: { fintech: 0.35, devtools: 0.35, security: 0.15, hr: 0.15 },
    countries: { Denmark: 0.5, Sweden: 0.3, Norway: 0.2 },
  },
  {
    name: "Mälaren Spark Capital",
    country: "Sweden",
    kind: "VC fund",
    description: "Consumer, retail and gaming investor.",
    startMonthsAgo: 72, activeUntilMonthsAgo: 10, dealsPerYear: 8, leadProb: 0.4, followOnProb: 0.25, quality: -0.05,
    stages: { seed: 0.6, "series-a": 0.4 },
    sectors: { retail: 0.4, gaming: 0.3, food: 0.15, education: 0.15 },
    countries: { Sweden: 0.6, Finland: 0.2, Norway: 0.2 },
  },
  {
    name: "Arctic Loop Capital",
    country: "Norway",
    kind: "VC fund",
    description: "Mobility, logistics and ocean-tech investor from Oslo.",
    startMonthsAgo: 66, activeUntilMonthsAgo: 0, dealsPerYear: 8, leadProb: 0.5, followOnProb: 0.45, quality: 0.1,
    stages: { seed: 0.5, "series-a": 0.5 },
    sectors: { mobility: 0.35, logistics: 0.35, climate: 0.3 },
    countries: { Norway: 0.5, Sweden: 0.2, Finland: 0.2, Denmark: 0.1 },
  },
  {
    name: "Kettu Ventures",
    country: "Finland",
    kind: "VC fund",
    description: "Generalist pre-seed and seed fund run by former founders.",
    startMonthsAgo: 60, activeUntilMonthsAgo: 0, dealsPerYear: 10, leadProb: 0.35, followOnProb: 0.35, quality: 0.05,
    stages: { "pre-seed": 0.45, seed: 0.55 },
    sectors: BROAD,
    countries: { Finland: 0.7, Estonia: 0.15, Sweden: 0.15 },
  },
];

const BACKGROUND_NAMES = [
  "Harbor Lane Capital", "Fjell Partners", "Birch & Pine Ventures", "Copperline VC", "Silverfir Capital",
  "Lakeview Angels", "Snowcap Growth", "Brightwater Capital", "Northgate Partners", "Ironwood Ventures",
  "Bluefjord Capital", "Greenridge VC", "Seabird Ventures", "Stonebridge Angels", "Wildflower Capital",
  "Elmstreet Partners", "Hilltop Seed", "Riverbend Ventures", "Cedar Grove Capital", "Moonrise Ventures",
];

const BACKGROUND: Profile[] = BACKGROUND_NAMES.map((name, i) => ({
  name,
  country: Object.keys(NORDICS)[i % 7],
  kind: i % 4 === 0 ? "Angel group" : "VC fund",
  description: "Background investor in the demo dataset.",
  startMonthsAgo: 90,
  activeUntilMonthsAgo: 0,
  dealsPerYear: 9,
  leadProb: 0.45,
  followOnProb: 0.35,
  quality: 0,
  stages: i % 3 === 0 ? { "series-a": 0.4, "series-b": 0.4, "series-c+": 0.2 } : { "pre-seed": 0.2, seed: 0.5, "series-a": 0.3 },
  sectors: BROAD,
  countries: NORDICS,
  background: true,
}));

const SECTOR_TEMPLATES: Record<string, string[]> = {
  logistics: [
    "Warehouse robotics for e-commerce fulfilment",
    "Cold-chain monitoring sensors for food logistics",
    "Freight marketplace connecting shippers and carriers",
    "Customs paperwork automation for cross-border freight",
    "Returns management software for online retailers",
    "Port and terminal scheduling software",
    "Parcel locker network for apartment buildings",
  ],
  mobility: [
    "EV charging management for apartment buildings",
    "Electric boat drivetrains",
    "Car-sharing for housing companies",
    "Battery health diagnostics for used electric cars",
    "Micromobility parking hubs for cities",
  ],
  fintech: [
    "Payments API for Nordic SMEs",
    "Expense management for startups",
    "Open-banking credit scoring for consumers",
    "Invoice financing for freelancers",
    "Embedded insurance for online shops",
    "Automated bookkeeping for small businesses",
  ],
  health: [
    "Remote monitoring for heart-failure patients",
    "Triage assistant for primary-care clinics",
    "Digital therapy for chronic pain",
    "At-home fertility testing",
    "Hospital staff scheduling software",
  ],
  climate: [
    "Industrial heat pumps for factories",
    "Carbon accounting software for manufacturers",
    "Green hydrogen electrolyser components",
    "Textile recycling with chemical separation",
    "Smart grid flexibility for households",
    "Bio-based packaging materials",
  ],
  devtools: [
    "Observability platform for Kubernetes",
    "Code review assistant for engineering teams",
    "Database branching for developers",
    "Feature-flag management for mobile apps",
    "API testing automation",
  ],
  security: ["Passwordless identity for enterprises", "Fraud detection for marketplaces", "Privacy compliance automation"],
  retail: ["Resale marketplace for kids' clothing", "Shoppable video for brands", "Dark-store software for grocery delivery"],
  food: ["Oat-based dairy alternatives from fermentation", "Kitchen waste tracking for restaurants", "Vertical farming for leafy greens"],
  hr: ["Skills-based hiring platform", "Employee wellbeing analytics", "Payroll for distributed teams"],
  education: ["Language learning with conversational tutors", "Coding curriculum platform for schools", "Teacher workload assistant"],
  deeptech: ["Quantum computing control electronics", "Photonics chips for data centres", "Satellite imaging analytics", "Autonomous inspection drones"],
  gaming: ["Cozy mobile games studio", "Esports team management tools", "User-generated content tools for game studios"],
};

const ROOTS = [
  "Routa", "Kuura", "Halla", "Vire", "Tuisku", "Kipinä", "Sointu", "Usva", "Hyöky", "Pilvi", "Virta", "Kajo",
  "Sade", "Tähti", "Kivi", "Meri", "Joki", "Tuuli", "Aamu", "Valo", "Varjo", "Savu", "Hehku", "Loiste", "Taika",
  "Into", "Kaiku", "Helmi", "Ranta", "Nummi", "Saari", "Kallio", "Lehto", "Laakso", "Nordly", "Fjordy", "Brisk",
  "Polaro", "Driftly", "Glimt", "Nimbu", "Skarp", "Vela", "Lyra", "Orbi", "Tidal", "Koru", "Mesi", "Pihka",
  "Tervas", "Viima", "Rae", "Noki", "Siro", "Utu", "Ilma", "Hanki", "Okra",
];

const SUFFIX: Record<string, string[]> = {
  logistics: ["Logistics", "Cargo", "Flow", "Ops", "Freight"],
  mobility: ["Mobility", "Motion", "Drive", "Charge"],
  fintech: ["Pay", "Finance", "Ledger", "Credit"],
  health: ["Health", "Care", "Med", "Clinic"],
  climate: ["Energy", "Grid", "Carbon", "Power", "Circular"],
  devtools: ["Labs", "Dev", "Stack", "Cloud"],
  security: ["Shield", "Secure", "ID"],
  retail: ["Shop", "Market", "Commerce"],
  food: ["Foods", "Kitchen", "Agri"],
  hr: ["Talent", "Teams", "Works"],
  education: ["Learn", "Academy", "Edu"],
  deeptech: ["Quantum", "Photonics", "Robotics", "Space"],
  gaming: ["Games", "Play", "Studio"],
};

const AMOUNT_RANGE: Record<Stage, [number, number]> = {
  "pre-seed": [0.2e6, 1e6],
  seed: [1e6, 4e6],
  "series-a": [5e6, 15e6],
  "series-b": [15e6, 40e6],
  "series-c+": [40e6, 100e6],
  growth: [80e6, 200e6],
  unknown: [1e6, 5e6],
};

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoWorld {
  investors: Investor[];
  profileInvestorNames: string[];
  companies: Record<string, Company>;
  rounds: Round[];
}

let WORLD: DemoWorld | null = null;

export function getDemoWorld(): DemoWorld {
  if (!WORLD) WORLD = generate(new Date());
  return WORLD;
}

function generate(now: Date): DemoWorld {
  const rnd = mulberry32(2026);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const weighted = (w: Record<string, number>): string => {
    const entries = Object.entries(w);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    let x = rnd() * total;
    for (const [k, v] of entries) {
      x -= v;
      if (x <= 0) return k;
    }
    return entries[entries.length - 1][0];
  };
  const monthsAgo = (m: number) => {
    const d = new Date(now.getTime() - m * 30.4375 * 24 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  };
  const ageMonths = (iso: string) => (now.getTime() - new Date(`${iso}T00:00:00Z`).getTime()) / (30.4375 * 24 * 3600 * 1000);

  const all = [...PROFILES, ...BACKGROUND];
  const investors: Investor[] = all.map((p) => ({
    id: slug(p.name),
    name: p.name,
    country: p.country,
    kind: p.kind,
    description: p.description,
  }));

  const companies: Record<string, Company> = {};
  const rounds: Round[] = [];
  const usedNames = new Set<string>();

  const newCompany = (sector: string, description?: string, name?: string, country?: string): Company => {
    let n = name;
    while (!n || usedNames.has(n)) n = `${pick(ROOTS)} ${pick(SUFFIX[sector])}`;
    usedNames.add(n);
    const desc = description ?? pick(SECTOR_TEMPLATES[sector]);
    const inferred = inferSectors(desc);
    const c: Company = {
      id: slug(n),
      name: n,
      description: desc,
      sectors: [sector, ...inferred.filter((s) => s !== sector)].slice(0, 2),
      country: country ?? weighted(NORDICS),
    };
    companies[c.id] = c;
    return c;
  };

  const activeAt = (p: Profile, iso: string) => {
    const age = ageMonths(iso);
    return age <= p.startMonthsAgo && age >= p.activeUntilMonthsAgo;
  };

  const makeRound = (c: Company, stage: Stage, date: string, parts: Participation[], amount?: number): Round => {
    const [lo, hi] = AMOUNT_RANGE[stage];
    const amountEur = amount ?? Math.round((lo + rnd() * (hi - lo)) / 1e5) * 1e5;
    const r: Round = {
      id: `${c.id}-${stage}-${date.slice(0, 7)}`,
      companyId: c.id,
      companyName: c.name,
      date,
      stage,
      stageLabel: STAGE_LABEL[stage],
      amountEur,
      amountLabel: `€${(amountEur / 1e6).toFixed(1)}M`,
      investors: parts,
      sources: [{ name: "Synthetic demo record", date }],
    };
    rounds.push(r);
    for (const p of parts) countDeal(p.investorName, date);
    return r;
  };

  // Keep each investor close to its yearly deal budget
  const dealCount = new Map<string, number>();
  const budgetFactor = (p: Profile, date: string) => {
    const used = dealCount.get(`${p.name}|${date.slice(0, 4)}`) ?? 0;
    return Math.max(0.03, 1 - used / p.dealsPerYear);
  };
  const countDeal = (name: string, date: string) => {
    const k = `${name}|${date.slice(0, 4)}`;
    dealCount.set(k, (dealCount.get(k) ?? 0) + 1);
  };

  const chooseInvestors = (c: Company, stage: Stage, date: string, exclude: Set<string>, n: number): Profile[] => {
    const chosen: Profile[] = [];
    for (let k = 0; k < n; k++) {
      const cands = all.filter((p) => !exclude.has(p.name) && !chosen.includes(p) && activeAt(p, date));
      const weights = cands.map((p) => {
        const s = p.stages[stage] ?? 0;
        const sec = (p.sectors[c.sectors[0]] ?? 0) + 0.02;
        const geo = (p.countries[c.country ?? ""] ?? 0) + 0.02;
        const bg = p.background ? 0.35 : 1;
        return s * sec * geo * p.dealsPerYear * bg * budgetFactor(p, date);
      });
      const total = weights.reduce((a, b) => a + b, 0);
      if (total <= 0) break;
      let x = rnd() * total;
      let idx = 0;
      for (; idx < weights.length; idx++) {
        x -= weights[idx];
        if (x <= 0) break;
      }
      chosen.push(cands[Math.min(idx, cands.length - 1)]);
    }
    return chosen;
  };

  const assignLead = (ps: Profile[]): Participation[] => {
    if (ps.length === 0) return [];
    const weights = ps.map((p) => p.leadProb * p.leadProb + 0.002);
    const total = weights.reduce((a, b) => a + b, 0);
    let x = rnd() * total;
    let leadIdx = 0;
    for (; leadIdx < ps.length; leadIdx++) {
      x -= weights[leadIdx];
      if (x <= 0) break;
    }
    return ps.map((p, i) => ({ investorId: slug(p.name), investorName: p.name, isLead: i === Math.min(leadIdx, ps.length - 1) }));
  };

  // Company histories
  const NUM_COMPANIES = 560;
  for (let i = 0; i < NUM_COMPANIES; i++) {
    const sector = weighted(BROAD);
    const c = newCompany(sector);
    const r0 = rnd();
    let stage: Stage = r0 < 0.35 ? "pre-seed" : r0 < 0.75 ? "seed" : r0 < 0.9 ? "series-a" : "series-b";
    let date = monthsAgo(1 + rnd() * 78);
    let prev: Profile[] = [];
    const ever = new Set<string>(); // investors who already had their chance in this company
    for (;;) {
      // Previous investors may follow on
      const followers = prev.filter((p) => activeAt(p, date) && rnd() < p.followOnProb);
      const want = stage === "pre-seed" ? 1 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 3);
      const fresh = chooseInvestors(c, stage, date, ever, Math.max(1, want - followers.length));
      const ps = [...fresh, ...followers];
      if (ps.length === 0) break;
      makeRound(c, stage, date, assignLead(ps));
      for (const p of ps) ever.add(p.name);
      prev = ps;
      // Will the company raise again?
      const avgQ = ps.reduce((s, p) => s + p.quality, 0) / ps.length;
      const base: Partial<Record<Stage, number>> = { "pre-seed": 0.55, seed: 0.45, "series-a": 0.45, "series-b": 0.4, "series-c+": 0.3 };
      const p = (base[stage] ?? 0) + avgQ;
      const nextIdx: number = STAGE_ORDER.indexOf(stage) + 1;
      if (nextIdx >= STAGE_ORDER.length || rnd() > p) break;
      const gap = 12 + rnd() * 14;
      const nextAge = ageMonths(date) - gap;
      if (nextAge < 0.5) break; // hasn't happened yet
      stage = STAGE_ORDER[nextIdx];
      date = monthsAgo(nextAge);
    }
  }

  // ---- Story rounds that make the demo point clearly ----
  const part = (n: string, lead: boolean): Participation => ({ investorId: slug(n), investorName: n, isLead: lead });

  const routeMind = newCompany("logistics", "AI route optimization for trucking and delivery fleets", "RouteMind AI", "Finland");
  makeRound(routeMind, "seed", monthsAgo(20), [part("Aurora Peak Capital", true), part("Revontuli Angels", false), part("Hilltop Seed", false)], 2.5e6);
  makeRound(routeMind, "series-a", monthsAgo(4), [part("Harbor Lane Capital", true), part("Copperline VC", false)], 9e6);

  const fleetPulse = newCompany("logistics", "Telematics and driver-safety analytics for truck fleets", "FleetPulse", "Sweden");
  makeRound(fleetPulse, "seed", monthsAgo(15), [part("Birch & Pine Ventures", true), part("Lumo Ventures", false)], 3.1e6);

  const lastu = newCompany("logistics", "Warehouse robotics for e-commerce fulfilment", "Lastu Robotics", "Finland");
  makeRound(lastu, "seed", monthsAgo(2), [part("Sisu Seed Partners", true), part("Kettu Ventures", false)], 3.4e6);

  const kuura = newCompany("logistics", "Customs paperwork automation for cross-border freight", "Kuura Cargo", "Estonia");
  makeRound(kuura, "pre-seed", monthsAgo(30), [part("Sisu Seed Partners", true), part("Revontuli Angels", false)], 0.8e6);
  makeRound(kuura, "seed", monthsAgo(16), [part("Sisu Seed Partners", true), part("Lumo Ventures", false)], 2.8e6);
  makeRound(kuura, "series-a", monthsAgo(3), [part("Arctic Loop Capital", true), part("Sisu Seed Partners", false)], 11e6);

  // Anna's company — must land in Mikko's "Companies to watch" (pre-seed, 14 mo ago, logistics, Finland)
  const lumipolku = newCompany(
    "logistics",
    "AI route planning for trucking fleets — cuts empty kilometres and fuel costs",
    "Lumipolku Logistics (demo)",
    "Finland",
  );
  makeRound(
    lumipolku,
    "pre-seed",
    monthsAgo(14),
    [part("Kettu Ventures", true), part("Revontuli Angels", false)],
    0.8e6,
  );

  return {
    investors,
    profileInvestorNames: PROFILES.map((p) => p.name),
    companies,
    rounds,
  };
}
