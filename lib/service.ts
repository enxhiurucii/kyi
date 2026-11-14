// Orchestration used by the API routes: provider → raw rounds → report card.

import { mapLimit } from "./cache";
import { calaConfigured } from "./cala/client";
import { buildCompanyReport } from "./companyReport";
import { buildReport } from "./metrics";
import { buildMarketReport } from "./market";
import type { CompanyRef, DataProvider } from "./provider";
import { newCtx, ProviderError } from "./provider";
import { CalaProvider } from "./providers/cala";
import { DemoProvider } from "./providers/demo";
import { fmtEur, fmtMonthYear, fmtMonthsAgo, monthsBetween } from "./format";
import { similarity } from "./similarity";
import type {
  CapTableRow,
  CompanyBrief,
  CompanyReport,
  Conflict,
  DataMode,
  Depth,
  Investor,
  InvestorReport,
  MarketReport,
  RankedInvestor,
  RankResponse,
  Stage,
  Startup,
  TalkingPoint,
  Thesis,
  ThesisRegion,
} from "./types";
import { STAGE_ORDER } from "./types";

const THESIS_REGIONS: ThesisRegion[] = ["Nordics", "Baltics", "DACH", "Europe", "Global"];

// Cala mode budgets (each company = 1 graph read). Raise them if Cala gives your key a higher rate limit.
const MAX_PORTFOLIO = Number(process.env.KYI_MAX_PORTFOLIO || 6); // companies checked for follow-on / graduation
const MAX_ENRICH = Number(process.env.KYI_MAX_ENRICH || 10); // recent companies checked for conflicts
const MIN_AGE_FOR_OUTCOME_MONTHS = 9; // a company needs time before "did they raise again?" means anything
const MAX_AGE_FOR_OUTCOME_MONTHS = 84;

let demo: DemoProvider | null = null;
let live: CalaProvider | null = null;

export function defaultMode(): DataMode {
  const env = process.env.KYI_DATA_MODE;
  if (env === "demo" || env === "cala") return env;
  return calaConfigured() ? "cala" : "demo";
}

export function getProvider(requested?: unknown): DataProvider {
  const mode: DataMode = requested === "demo" || requested === "cala" ? requested : defaultMode();
  if (mode === "cala") {
    if (!calaConfigured()) {
      throw new ProviderError("Live Cala data needs CALA_API_KEY in .env.local. Switch to demo data or add your key.", "missing_key", 400);
    }
    return (live ??= new CalaProvider());
  }
  return (demo ??= new DemoProvider());
}

export type OwnCompanyHint = { name?: string; entityId?: string } | null;

export async function buildInvestorReport(
  provider: DataProvider,
  query: string,
  startup: Startup | null,
  depth: Depth = "full",
  ownCompany: OwnCompanyHint = null,
): Promise<InvestorReport | null> {
  const t0 = Date.now();
  const ctx = newCtx();
  const investor = await provider.resolveInvestor(query, ctx);
  if (!investor) return null;

  const quick = depth === "quick" && provider.mode === "cala"; // demo data is free, so always full
  const { rounds, companies } = await provider.getInvestorRounds(investor, ctx, quick ? { detail: 0 } : undefined);

  // Per portfolio company: when did the investor first come in, and when were they last involved?
  const now = Date.now();
  const byCompany = new Map<string, { ref: CompanyRef; first: string; last: string }>();
  for (const r of rounds) {
    const d = r.date ?? "";
    const e = byCompany.get(r.companyId);
    if (!e) {
      byCompany.set(r.companyId, {
        ref: { id: r.companyId, name: r.companyName, entityId: companies[r.companyId]?.entityId },
        first: d,
        last: d,
      });
    } else {
      if (d && (!e.first || d < e.first)) e.first = d;
      if (d > e.last) e.last = d;
    }
  }
  const all = [...byCompany.values()].filter((x) => x.ref.id); // skip rounds whose company isn't loaded
  const demo = provider.mode === "demo";

  // For the conflict check we care about the CURRENT portfolio → most recent involvement first.
  const recentRefs = [...all]
    .sort((a, b) => b.last.localeCompare(a.last))
    .slice(0, demo ? 500 : MAX_ENRICH)
    .map((x) => x.ref);

  // For follow-on / graduation we need companies that have had time to raise again, picked by ENTRY date.
  // (Picking by last involvement would favour companies where the investor came back = biased upwards.)
  const ageMonths = (iso: string) => (iso ? (now - new Date(`${iso}T00:00:00Z`).getTime()) / (30.4375 * 864e5) : -1);
  const matureRefs = all
    .filter((x) => ageMonths(x.first) >= MIN_AGE_FOR_OUTCOME_MONTHS && ageMonths(x.first) <= MAX_AGE_FOR_OUTCOME_MONTHS)
    .sort((a, b) => b.first.localeCompare(a.first))
    .slice(0, demo ? 500 : MAX_PORTFOLIO)
    .map((x) => x.ref);

  const enriched = quick ? companies : await provider.enrichCompanies(recentRefs, companies, ctx);
  const companyRounds = quick ? {} : await provider.getCompanyRounds(matureRefs, ctx);

  return buildReport({
    investor,
    investorRounds: rounds,
    companyRounds,
    companies: enriched,
    startup,
    ownCompany,
    dataMode: provider.mode,
    depth: quick ? "quick" : "full",
    trace: { queries: summarize(ctx.queries), calls: ctx.calls, cacheHits: ctx.cacheHits, ms: Date.now() - t0 },
  });
}

export async function rankInvestors(
  provider: DataProvider,
  names: string[],
  startup: Startup,
  depth: Depth = "quick",
  ownCompany: OwnCompanyHint = null,
): Promise<RankResponse> {
  const notFound: string[] = [];
  const errors: { input: string; message: string }[] = [];
  const results = await mapLimit(names, provider.mode === "cala" ? 2 : 8, async (input) => {
    try {
      const report = await buildInvestorReport(provider, input, startup, depth, ownCompany);
      if (!report) {
        notFound.push(input);
        return null;
      }
      return toRanked(input, report);
    } catch (e) {
      if (e instanceof ProviderError && (e.code === "auth" || e.code === "missing_key")) throw e;
      errors.push({ input, message: (e as Error).message });
      return null;
    }
  });
  const ranked = results.filter((r): r is RankedInvestor => !!r).sort((a, b) => b.fitScore.score - a.fitScore.score);
  return { dataMode: provider.mode, ranked, notFound, errors };
}

function toRanked(input: string, r: InvestorReport): RankedInvestor {
  return {
    input,
    depth: r.depth,
    investor: r.investor,
    fitScore: r.fitScore ?? { score: 0, reasons: [] },
    status: r.activity.status,
    monthsSinceLastDeal: r.activity.monthsSinceLastDeal,
    dealsLast12m: r.activity.dealsLast12m,
    leadRate: r.leadership.leadRate,
    followOnRate: r.followOn.rate,
    graduationRate: r.graduation.rate,
    topConflict: r.conflicts[0] ?? null,
    typicalStage: r.fit.typicalStage,
  };
}

/** Collapse repeated graph reads into one line with a count, e.g. "POST /v1/entities/{round} … ×38". */
function summarize(xs: string[]): string[] {
  const counts = new Map<string, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].map(([q, n]) => (n > 1 ? `${q}  ×${n}` : q));
}

// ---------- Input validation ----------

export async function buildCompanyBrief(provider: DataProvider, companyQuery: string, fundQuery?: string | null): Promise<CompanyBrief | null> {
  const t0 = Date.now();
  const ctx = newCtx();
  const company = await provider.resolveCompany(companyQuery, ctx);
  if (!company) return null;

  const ref: CompanyRef = { id: company.id, name: company.name, entityId: company.entityId };
  const byId = await provider.getCompanyRounds([ref], ctx, { detail: provider.mode === "cala" ? 5 : 40 });
  const list = [...(byId[company.id] ?? [])].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const enriched = await provider.enrichCompanies([ref], { [company.id]: company }, ctx);
  const co = enriched[company.id] ?? company;

  const last = list[0] ?? null;
  const amounts = list.map((r) => r.amountEur).filter((n): n is number => n != null && n > 0);
  const totalRaisedEur = amounts.length ? amounts.reduce((s, n) => s + n, 0) : null;
  const monthsSinceLastRound = last?.date ? monthsBetween(new Date(`${last.date}T00:00:00Z`), new Date()) : null;

  const cap = new Map<string, CapTableRow>();
  for (const r of list) {
    for (const p of r.investors) {
      const row = cap.get(p.investorId) ?? {
        investorId: p.investorId,
        investorName: p.investorName,
        leads: 0,
        rounds: 0,
        isOnLastRound: false,
        roundIds: [],
      };
      row.rounds += 1;
      if (p.isLead) row.leads += 1;
      if (last && r.id === last.id) row.isOnLastRound = true;
      row.roundIds.push(r.id);
      cap.set(p.investorId, row);
    }
  }
  const capTable = [...cap.values()].sort((a, b) => b.leads - a.leads || b.rounds - a.rounds);

  let fund: Investor | null = null;
  const conflicts: Conflict[] = [];
  const extraRounds: CompanyBrief["rounds"] = {};
  if (fundQuery?.trim()) {
    fund = await provider.resolveInvestor(fundQuery.trim(), ctx);
    if (fund) {
      const { rounds: irounds, companies: icos } = await provider.getInvestorRounds(fund, ctx, { detail: 0 });
      for (const r of irounds) extraRounds[r.id] = r;
      const recent = new Map<string, CompanyRef>();
      for (const r of [...irounds].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))) {
        if (r.companyId === co.id) continue;
        if (!recent.has(r.companyId)) recent.set(r.companyId, { id: r.companyId, name: r.companyName, entityId: icos[r.companyId]?.entityId });
        if (recent.size >= 8) break;
      }
      const port = await provider.enrichCompanies([...recent.values()], icos, ctx);
      for (const other of Object.values(port)) {
        const sim = similarity(co.description || co.name, other.description || other.name);
        const sameSector = co.sectors.some((s) => other.sectors.includes(s));
        const score = sim.score + (sameSector ? 0.12 : 0);
        if (score < 0.28) continue;
        const roundIds = irounds.filter((r) => r.companyId === other.id).map((r) => r.id);
        conflicts.push({
          companyId: other.id,
          companyName: other.name,
          description: other.description,
          similarity: Math.min(1, score),
          matchedTerms: sim.matched.slice(0, 6),
          roundIds,
        });
      }
      conflicts.sort((a, b) => b.similarity - a.similarity);
    }
  }

  const alreadyIn = !!(
    fund &&
    (capTable.some((r) => r.investorId === fund.id || r.investorName === fund.name) || Object.values(extraRounds).some((r) => r.companyId === co.id || r.companyName === co.name))
  );
  const talkingPoints = companyTalkingPoints({ co, last, monthsSinceLastRound, totalRaisedEur, capTable, conflicts, alreadyIn, fundName: fund?.name ?? null });
  const warnings: string[] = [];
  if (list.length === 0) warnings.push("No funding rounds found for this company in the graph yet.");
  else if (list.every((r) => r.investors.length === 0)) warnings.push("Round dates are there, but co-investors were not attached to these edges.");
  if (fundQuery && !fund) warnings.push(`Could not resolve your fund “${fundQuery}” — conflict check skipped.`);

  const rounds: CompanyBrief["rounds"] = { ...extraRounds };
  for (const r of list) rounds[r.id] = r;

  return {
    company: co,
    dataMode: provider.mode,
    fund,
    lastRound: last,
    monthsSinceLastRound,
    totalRaisedEur,
    roundCount: list.length,
    capTable,
    alreadyIn,
    conflicts: conflicts.slice(0, 5),
    talkingPoints,
    rounds,
    warnings,
    generatedAt: new Date().toISOString(),
    trace: { queries: summarize(ctx.queries), calls: ctx.calls, cacheHits: ctx.cacheHits, ms: Date.now() - t0 },
  };
}

function companyTalkingPoints(x: {
  co: { name: string; description: string };
  last: CompanyBrief["lastRound"];
  monthsSinceLastRound: number | null;
  totalRaisedEur: number | null;
  capTable: CapTableRow[];
  conflicts: Conflict[];
  alreadyIn: boolean;
  fundName: string | null;
}): TalkingPoint[] {
  const out: TalkingPoint[] = [];
  if (x.last) {
    const lead = x.last.investors.find((p) => p.isLead);
    out.push({
      text: `Last round: ${x.last.stageLabel} in ${fmtMonthYear(x.last.date)}${x.last.amountLabel ? ` · ${x.last.amountLabel}` : ""}${lead ? ` · led by ${lead.investorName}` : ""}. Ask what changed since then.`,
      tone: "neutral",
      roundIds: [x.last.id],
    });
  }
  if (x.alreadyIn) {
    out.push({ text: `${x.fundName} is already on the cap table. This meeting is a follow-on conversation, not a first cheque.`, tone: "warn", roundIds: [] });
  }
  if (x.conflicts[0]) {
    out.push({
      text: `Conflict: your portfolio already includes ${x.conflicts[0].companyName} (${Math.round(x.conflicts[0].similarity * 100)}% similar). Ask how they are not competing.`,
      tone: "bad",
      roundIds: x.conflicts[0].roundIds,
    });
  }
  if (x.monthsSinceLastRound != null && x.monthsSinceLastRound >= 18) {
    out.push({ text: `Last raise was ${fmtMonthsAgo(x.monthsSinceLastRound)}. A long gap is either discipline or a stalled process — ask which.`, tone: "warn", roundIds: x.last ? [x.last.id] : [] });
  }
  if (x.totalRaisedEur) {
    out.push({ text: `Cala records ${fmtEur(x.totalRaisedEur)} raised across ${x.capTable.length || "unknown"} investors. Check whether that matches what they put in the deck.`, tone: "neutral", roundIds: [] });
  }
  if (x.capTable[0] && !x.alreadyIn) {
    out.push({
      text: `You would be sitting with ${x.capTable[0].investorName} (${x.capTable[0].rounds} rounds${x.capTable[0].leads ? `, ${x.capTable[0].leads} as lead` : ""}). Ask the founder who actually writes the next cheque.`,
      tone: "good",
      roundIds: x.capTable[0].roundIds,
    });
  }
  return out.slice(0, 6);
}

export function parseStartup(x: unknown): Startup | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const description = typeof o.description === "string" ? o.description.slice(0, 600) : "";
  const stage = typeof o.stage === "string" && (STAGE_ORDER as string[]).includes(o.stage) ? (o.stage as Stage) : "seed";
  const country = typeof o.country === "string" ? o.country.slice(0, 160) : "";
  if (!description.trim()) return null;
  return { description, stage, country };
}

export function parseThesis(x: unknown): Thesis | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const sectors = Array.isArray(o.sectors)
    ? o.sectors.filter((s): s is string => typeof s === "string").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 12)
    : [];
  const stages = Array.isArray(o.stages)
    ? o.stages.filter((s): s is Stage => typeof s === "string" && (STAGE_ORDER as string[]).includes(s)).slice(0, 8)
    : [];
  const regions = Array.isArray(o.regions)
    ? o.regions.filter((r): r is ThesisRegion => typeof r === "string" && (THESIS_REGIONS as string[]).includes(r)).slice(0, 5)
    : [];
  if (!sectors.length && !stages.length && !regions.length) return null;
  const ticketMinEur = typeof o.ticketMinEur === "number" && Number.isFinite(o.ticketMinEur) ? o.ticketMinEur : undefined;
  const ticketMaxEur = typeof o.ticketMaxEur === "number" && Number.isFinite(o.ticketMaxEur) ? o.ticketMaxEur : undefined;
  return { sectors, stages, regions, ticketMinEur, ticketMaxEur };
}

export async function buildMarketReportFor(
  provider: DataProvider,
  thesis: Thesis,
): Promise<MarketReport> {
  const t0 = Date.now();
  const ctx = newCtx();
  const { rounds, companies } = await provider.getSectorRounds(thesis, ctx);
  return buildMarketReport(rounds, companies, thesis, new Date(), {
    dataMode: provider.mode,
    trace: { queries: summarize(ctx.queries), calls: ctx.calls, cacheHits: ctx.cacheHits, ms: Date.now() - t0 },
  });
}

export async function buildCompanyReportFor(
  provider: DataProvider,
  companyRef: string,
  thesis?: Thesis | null,
): Promise<CompanyReport | null> {
  const t0 = Date.now();
  const ctx = newCtx();
  const profile = await provider.getCompanyProfile(companyRef, ctx);
  if (!profile) return null;

  let sampleRounds = profile.rounds;
  let similarCandidates = await provider.searchCompanies(
    profile.company.sectors[0] ?? profile.company.name.slice(0, 12),
    ctx,
  );

  if (thesis) {
    try {
      const sample = await provider.getSectorRounds(thesis, ctx);
      sampleRounds = sample.rounds;
      similarCandidates = Object.values(sample.companies);
    } catch {
      /* keep company rounds / search similar */
    }
  }

  return buildCompanyReport(profile, {
    thesis: thesis ?? null,
    sampleRounds,
    similarCandidates,
    dataMode: provider.mode,
    trace: { queries: summarize(ctx.queries), calls: ctx.calls, cacheHits: ctx.cacheHits, ms: Date.now() - t0 },
  });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof ProviderError) {
    return Response.json({ error: e.message, code: e.code }, { status: e.status });
  }
  console.error(e);
  return Response.json({ error: "Something went wrong. Check the server logs.", code: "internal" }, { status: 500 });
}
