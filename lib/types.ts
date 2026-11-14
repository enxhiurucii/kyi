// Core domain types shared by the backend (API routes) and the frontend.

export type Stage =
  | "pre-seed"
  | "seed"
  | "series-a"
  | "series-b"
  | "series-c+"
  | "growth"
  | "unknown";

export const STAGE_ORDER: Stage[] = [
  "pre-seed",
  "seed",
  "series-a",
  "series-b",
  "series-c+",
  "growth",
];

export const STAGE_LABEL: Record<Stage, string> = {
  "pre-seed": "Pre-seed",
  seed: "Seed",
  "series-a": "Series A",
  "series-b": "Series B",
  "series-c+": "Series C+",
  growth: "Growth",
  unknown: "Unknown",
};

export type DataMode = "demo" | "cala";

export interface SourceRef {
  name: string;
  url?: string;
  date?: string;
}

export interface Participation {
  investorId: string;
  investorName: string;
  /** true = led the round, false = participated, null = unknown */
  isLead: boolean | null;
}

export interface Round {
  id: string;
  companyId: string;
  companyName: string;
  /** ISO date (YYYY-MM-DD). Month/day may be approximated when the source only gives a year or month. */
  date: string | null;
  stage: Stage;
  /** Original label from the source, e.g. "Series A" */
  stageLabel: string;
  amountEur: number | null;
  /** Original amount text from the source, e.g. "€38.9M ($40M)" */
  amountLabel: string | null;
  investors: Participation[];
  sources: SourceRef[];
  /** Cala entity id of the funding round, if known (used to fetch provenance on demand) */
  entityId?: string;
}

export interface Company {
  id: string;
  name: string;
  description: string;
  sectors: string[];
  country: string | null;
  entityId?: string;
  foundedYear?: number;
  status?: string;
}

export interface Investor {
  id: string;
  name: string;
  description?: string;
  country?: string | null;
  kind?: string;
  entityId?: string;
}

export interface Startup {
  description: string;
  stage: Stage;
  country: string;
}

// ---------- Report card ----------

export type Tone = "good" | "warn" | "bad" | "neutral";

export interface QuarterBucket {
  quarter: string; // e.g. "2025-Q3"
  deals: number;
  leads: number;
}

export interface CompanyOutcome {
  companyId: string;
  companyName: string;
  /** did the investor come back / did the company raise again */
  yes: boolean;
  /** rounds that prove the outcome */
  roundIds: string[];
}

export interface Conflict {
  companyId: string;
  companyName: string;
  description: string;
  similarity: number; // 0..1
  matchedTerms: string[];
  roundIds: string[];
}

export interface TalkingPoint {
  text: string;
  tone: Tone;
  roundIds: string[];
}

export interface FitReason {
  label: string;
  tone: Tone;
}

/** Points contributed by each fit bucket (conflict is ≤ 0). */
export interface FitBreakdown {
  activity: number;
  stage: number;
  sector: number;
  leads: number;
  followOn: number;
  geo: number;
  conflict: number;
}

export interface FitScore {
  score: number; // 0..100
  reasons: FitReason[];
  /** Optional for older cached payloads; UI falls back to reasons-only. */
  breakdown?: FitBreakdown;
}

export interface Distribution {
  key: string;
  label: string;
  count: number;
}

export type Depth = "quick" | "full";

export interface InvestorReport {
  investor: Investor;
  dataMode: DataMode;
  /** quick = activity/lead/stage only (cheap); full = adds follow-on, graduation, conflicts, co-investors */
  depth: Depth;
  generatedAt: string;
  activity: {
    status: "active" | "slowing" | "inactive" | "unknown";
    lastDealDate: string | null;
    lastLeadDate: string | null;
    monthsSinceLastDeal: number | null;
    dealsLast12m: number;
    leadsLast12m: number;
    quarterly: QuarterBucket[];
    roundIds: string[];
  };
  leadership: {
    leadRate: number | null;
    leads: number;
    knownRoles: number;
    deals: number;
    roundIds: string[];
  };
  followOn: {
    rate: number | null;
    followed: number;
    eligible: number;
    companies: CompanyOutcome[];
  };
  graduation: {
    rate: number | null;
    graduated: number;
    eligible: number;
    companies: CompanyOutcome[];
  };
  fit: {
    stages: Distribution[];
    sectors: Distribution[];
    countries: Distribution[];
    medianRoundEur: number | null;
    typicalStage: Stage | null;
  };
  coInvestors: { name: string; count: number; roundIds: string[] }[];
  conflicts: Conflict[];
  talkingPoints: TalkingPoint[];
  fitScore: FitScore | null;
  /** Every round referenced anywhere in the report, keyed by id */
  rounds: Record<string, Round>;
  companies: Record<string, Company>;
  /** Data-quality notes shown to the user (missing lead info, small sample, ...) */
  warnings: string[];
  /** What we asked the data layer — shown in "Under the hood" */
  trace: { queries: string[]; calls: number; cacheHits: number; ms: number };
}

export interface RankedInvestor {
  input: string;
  depth: Depth;
  investor: Investor;
  fitScore: FitScore;
  status: InvestorReport["activity"]["status"];
  monthsSinceLastDeal: number | null;
  dealsLast12m: number;
  leadRate: number | null;
  followOnRate: number | null;
  graduationRate: number | null;
  topConflict: Conflict | null;
  typicalStage: Stage | null;
}

export interface RankResponse {
  dataMode: DataMode;
  ranked: RankedInvestor[];
  notFound: string[];
  errors: { input: string; message: string }[];
}

/** Pre-meeting brief for an investor diligencing a company. */
export interface CapTableRow {
  investorId: string;
  investorName: string;
  leads: number;
  rounds: number;
  isOnLastRound: boolean;
  roundIds: string[];
}

export interface CompanyBrief {
  company: Company;
  dataMode: DataMode;
  fund: Investor | null;
  lastRound: Round | null;
  monthsSinceLastRound: number | null;
  totalRaisedEur: number | null;
  roundCount: number;
  capTable: CapTableRow[];
  alreadyIn: boolean;
  conflicts: Conflict[];
  talkingPoints: TalkingPoint[];
  rounds: Record<string, Round>;
  warnings: string[];
  generatedAt: string;
  trace: { queries: string[]; calls: number; cacheHits: number; ms: number };
}

// ---------- Investor market / company report ----------

export type ThesisRegion = "Nordics" | "Baltics" | "DACH" | "Europe" | "Global";

export interface Thesis {
  sectors: string[];
  stages: Stage[];
  regions: ThesisRegion[];
  ticketMinEur?: number;
  ticketMaxEur?: number;
}

export interface MarketReport {
  thesis: Thesis;
  sampleSize: number;
  kpis: {
    deals12m: number;
    raised12mEur: number | null;
    medianRoundEur: number | null;
    /** Deals last 12m vs previous 12m, as a percent change (e.g. +20 = up 20%). */
    trendPct: number | null;
  };
  quarterly: { quarter: string; deals: number; raisedEur: number }[];
  recentRounds: Round[];
  topLeads: {
    investorId: string;
    name: string;
    leads: number;
    lastLeadDate: string | null;
    roundIds: string[];
  }[];
  toWatch: {
    company: Company;
    lastRound: Round;
    monthsSince: number;
    score: number;
    reasons: FitReason[];
    roundIds: string[];
  }[];
  warnings: string[];
  dataMode: DataMode;
  generatedAt: string;
  trace: { queries: string[]; calls: number; cacheHits: number; ms: number };
}

export interface CompanyReport {
  company: Company;
  rounds: Round[];
  investors: { name: string; id: string; isLead: boolean | null; roundIds: string[] }[];
  founders: { name: string; id?: string; role?: string; pastCompanies: string[] }[];
  similar: { company: Company; similarity: number }[];
  raiseSoon?: { score: number; reasons: FitReason[] };
  thesisFit?: { score: number; reasons: FitReason[] };
  sources: SourceRef[];
  warnings: string[];
  dataMode: DataMode;
  generatedAt: string;
  trace: { queries: string[]; calls: number; cacheHits: number; ms: number };
}

export interface CompanyProfileResult {
  company: Company;
  rounds: Round[];
  investors: { name: string; id: string; isLead: boolean | null; roundIds: string[] }[];
  founders: { name: string; id?: string; role?: string; pastCompanies: string[] }[];
  sources: SourceRef[];
}
