// Data-provider abstraction: the app computes the same report card from either
//  - "cala": live data from the Cala knowledge graph (https://api.cala.ai), or
//  - "demo": a synthetic, clearly-labelled dataset (works offline / without a key).

import type { Company, CompanyProfileResult, DataMode, Investor, Round, SourceRef, Thesis } from "./types";

/** Per-request trace: what we asked the data layer (shown in the UI under "Under the hood"). */
export interface Ctx {
  queries: string[];
  calls: number;
  cacheHits: number;
}

export function newCtx(): Ctx {
  return { queries: [], calls: 0, cacheHits: 0 };
}

export interface CompanyRef {
  id: string;
  name: string;
  entityId?: string;
}

export interface InvestorRoundsResult {
  rounds: Round[];
  companies: Record<string, Company>;
}

export interface DataProvider {
  readonly mode: DataMode;
  searchInvestors(q: string, ctx: Ctx): Promise<Investor[]>;
  resolveInvestor(q: string, ctx: Ctx): Promise<Investor | null>;
  searchCompanies(q: string, ctx: Ctx): Promise<Company[]>;
  resolveCompany(q: string, ctx: Ctx): Promise<Company | null>;
  /** All funding rounds the investor took part in (+ what we learned about those companies). */
  getInvestorRounds(inv: Investor, ctx: Ctx, opts?: { detail?: number }): Promise<InvestorRoundsResult>;
  /** All known funding rounds for each company (to see what happened after the investor came in). */
  getCompanyRounds(refs: CompanyRef[], ctx: Ctx, opts?: { detail?: number }): Promise<Record<string, Round[]>>;
  /** Fill in missing descriptions / sectors for companies (used by the conflict check). */
  enrichCompanies(refs: CompanyRef[], known: Record<string, Company>, ctx: Ctx): Promise<Record<string, Company>>;
  /** Sources for one round (on-demand provenance). */
  getSources(round: Round, ctx: Ctx): Promise<{ answer?: string; sources: SourceRef[] }>;
  /** Sector / region funding sample for market radar. */
  getSectorRounds(thesis: Thesis, ctx: Ctx): Promise<{ rounds: Round[]; companies: Record<string, Company> }>;
  /** Full company background: rounds, investors, founders. */
  getCompanyProfile(ref: string, ctx: Ctx): Promise<CompanyProfileResult | null>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public code: "missing_key" | "auth" | "rate_limited" | "timeout" | "upstream" | "bad_request",
    public status = 502,
  ) {
    super(message);
  }
}
