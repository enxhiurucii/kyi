import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { buildCompanyReport } from "../companyReport";
import { buildMarketReport } from "../market";
import { newCtx, type Ctx } from "../provider";
import type { CompanyProfile, FounderProfile } from "../profiles/types";
import { buildInvestorReport, getProvider } from "../service";
import { inferSectors, similarity } from "../similarity";
import type { DataMode, InvestorReport, Stage, Startup, Thesis, ThesisRegion } from "../types";
import { STAGE_ORDER } from "../types";

const BUDGET = 25;

export type ScoutStepFn = (icon: string, text: string) => void;
export type ScoutFor = "founder" | "investor";

function asStages(xs?: string[]): Stage[] {
  if (!xs?.length) return [];
  return xs.filter((s): s is Stage => (STAGE_ORDER as string[]).includes(s));
}

function asRegions(xs?: string[]): ThesisRegion[] {
  const allowed: ThesisRegion[] = ["Nordics", "Baltics", "DACH", "Europe", "Global"];
  if (!xs?.length) return [];
  return xs.filter((r): r is ThesisRegion => (allowed as string[]).includes(r));
}

export function createFounderScoutTools(opts: {
  startup: Startup;
  mode: DataMode;
  founder?: FounderProfile | null;
  company?: CompanyProfile | null;
  onStep: ScoutStepFn;
}) {
  let calaCalls = 0;
  const ctx: Ctx = newCtx();
  const provider = getProvider(opts.mode);
  const own = opts.company
    ? { name: opts.company.name, entityId: opts.company.calaCompanyId }
    : null;
  const reportCache = new Map<string, InvestorReport>();

  function budgetHit() {
    return calaCalls >= BUDGET;
  }
  async function spend(n = 1): Promise<boolean> {
    if (calaCalls + n > BUDGET) return false;
    calaCalls += n;
    return true;
  }
  function budgetLeft() {
    return BUDGET - calaCalls;
  }

  async function getReport(investor: string): Promise<InvestorReport | null> {
    const key = investor.trim().toLowerCase();
    const hit = reportCache.get(key);
    if (hit) return hit;
    const report = await buildInvestorReport(provider, investor, opts.startup, "quick", own);
    if (report) {
      reportCache.set(key, report);
      reportCache.set(report.investor.name.toLowerCase(), report);
      if (report.investor.id) reportCache.set(report.investor.id.toLowerCase(), report);
    }
    return report;
  }

  const search_similar_companies = {
    ...betaZodTool({
      name: "search_similar_companies",
      description:
        "Find companies similar to the founder’s startup via sector/region funding sample. Prefer ONE call.",
      inputSchema: z.object({
        keywords: z.string().describe("Short keywords, e.g. fleet logistics AI"),
        region: z.string().optional(),
        stages: z.array(z.string()).optional(),
      }),
      run: async ({ keywords, region, stages }) => {
        if (budgetHit()) return JSON.stringify({ budgetReached: true, results: [] });
        opts.onStep("🔎", `Searching similar companies: “${keywords.slice(0, 60)}”`);
        const cost = opts.mode === "demo" ? 1 : 3;
        if (!(await spend(cost))) return JSON.stringify({ budgetReached: true, results: [] });

        const sectors = inferSectors(`${keywords} ${opts.startup.description}`).slice(0, 3);
        const thesis: Thesis = {
          sectors: sectors.length ? sectors : ["logistics"],
          stages: asStages(stages).length ? asStages(stages) : [opts.startup.stage],
          regions: region
            ? asRegions([region])
            : opts.startup.country.match(/finland|sweden|norway|denmark|iceland/i)
              ? ["Nordics"]
              : ["Europe"],
        };
        try {
          const { rounds, companies } = await provider.getSectorRounds(thesis, ctx);
          const q = `${keywords} ${opts.startup.description}`;
          const scored = Object.values(companies)
            .map((c) => ({
              c,
              s: similarity(q, `${c.name} ${c.description} ${c.sectors.join(" ")}`).score,
            }))
            .sort((a, b) => b.s - a.s)
            .slice(0, 14);
          const results = scored.map(({ c, s }) => {
            const latest = rounds
              .filter((r) => r.companyId === c.id)
              .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];
            return {
              id: c.id,
              name: c.name,
              description: c.description,
              country: c.country,
              sectors: c.sectors,
              similarity: Math.round(s * 100),
              lastRoundId: latest?.id,
              lastRoundDate: latest?.date,
              lastStage: latest?.stageLabel,
            };
          });
          opts.onStep("🏢", `Found ${results.length} similar companies · ${budgetLeft()} left`);
          return JSON.stringify({ results, budgetLeft: budgetLeft() });
        } catch (e) {
          return JSON.stringify({ error: e instanceof Error ? e.message : "search failed", budgetLeft: budgetLeft() });
        }
      },
    }),
    eager_input_streaming: true as const,
  };

  const company_lead_investors = {
    ...betaZodTool({
      name: "company_lead_investors",
      description: "Leads of a company’s latest funding rounds. Call on at most 4–5 best-similar companies.",
      inputSchema: z.object({
        companyId: z.string(),
      }),
      run: async ({ companyId }) => {
        if (budgetHit()) return JSON.stringify({ budgetReached: true });
        opts.onStep("📈", `Reading leads · ${companyId.slice(0, 12)}…`);
        if (!(await spend(opts.mode === "demo" ? 1 : 2))) return JSON.stringify({ budgetReached: true });
        try {
          const profile = await provider.getCompanyProfile(companyId, ctx);
          if (!profile) return JSON.stringify({ error: "company not found", budgetLeft: budgetLeft() });
          const rounds = profile.rounds.slice(0, 3).map((r) => ({
            id: r.id,
            stageLabel: r.stageLabel,
            date: r.date,
            amountLabel: r.amountLabel,
            leads: r.investors.filter((p) => p.isLead === true).map((p) => ({ id: p.investorId, name: p.investorName })),
            investors: r.investors.map((p) => ({ id: p.investorId, name: p.investorName, isLead: p.isLead })),
            sources: r.sources,
          }));
          opts.onStep("📈", `${profile.company.name}: ${rounds[0]?.leads?.length ?? 0} lead(s)`);
          return JSON.stringify({
            company: profile.company,
            rounds,
            budgetLeft: budgetLeft(),
          });
        } catch (e) {
          return JSON.stringify({ error: e instanceof Error ? e.message : "failed", budgetLeft: budgetLeft() });
        }
      },
    }),
    eager_input_streaming: true as const,
  };

  const investor_report = {
    ...betaZodTool({
      name: "investor_report",
      description: "Quick KYI investor report (fit, activity, lead rate, conflict). At most 5–6 candidates.",
      inputSchema: z.object({
        investor: z.string(),
      }),
      run: async ({ investor }) => {
        if (budgetHit()) return JSON.stringify({ budgetReached: true });
        opts.onStep("🧭", `Report card: ${investor}`);
        const cost = opts.mode === "demo" ? 1 : 2;
        if (!(await spend(cost))) return JSON.stringify({ budgetReached: true });
        try {
          const report = await getReport(investor);
          if (!report) return JSON.stringify({ error: "not found", budgetLeft: budgetLeft() });
          return JSON.stringify({
            id: report.investor.id,
            name: report.investor.name,
            status: report.activity.status,
            dealsLast12m: report.activity.dealsLast12m,
            monthsSinceLastDeal: report.activity.monthsSinceLastDeal,
            leadRate: report.leadership.leadRate,
            fitScore: report.fitScore?.score ?? null,
            fitReasons: report.fitScore?.reasons?.slice(0, 6) ?? [],
            conflict: report.conflicts[0]
              ? {
                  companyName: report.conflicts[0].companyName,
                  similarity: report.conflicts[0].similarity,
                  description: report.conflicts[0].description,
                }
              : null,
            recentRoundIds: report.activity.roundIds.slice(0, 6),
            budgetLeft: budgetLeft(),
          });
        } catch (e) {
          return JSON.stringify({ error: e instanceof Error ? e.message : "report failed", budgetLeft: budgetLeft() });
        }
      },
    }),
    eager_input_streaming: true as const,
  };

  return [search_similar_companies, company_lead_investors, investor_report];
}

export function createInvestorScoutTools(opts: {
  thesis: Thesis;
  mode: DataMode;
  onStep: ScoutStepFn;
}) {
  let calaCalls = 0;
  const ctx: Ctx = newCtx();
  const provider = getProvider(opts.mode);
  let sampleRounds: Awaited<ReturnType<typeof provider.getSectorRounds>> | null = null;

  function budgetHit() {
    return calaCalls >= BUDGET;
  }
  async function spend(n = 1): Promise<boolean> {
    if (calaCalls + n > BUDGET) return false;
    calaCalls += n;
    return true;
  }
  function budgetLeft() {
    return BUDGET - calaCalls;
  }

  const market_report = {
    ...betaZodTool({
      name: "market_report",
      description: "Build the Market Radar for the investor thesis (KPIs, top leads, companies to watch).",
      inputSchema: z.object({
        thesis: z
          .object({
            sectors: z.array(z.string()).optional(),
            stages: z.array(z.string()).optional(),
            regions: z.array(z.string()).optional(),
            ticketMinEur: z.number().optional(),
            ticketMaxEur: z.number().optional(),
          })
          .optional(),
      }),
      run: async ({ thesis: override }) => {
        if (budgetHit()) return JSON.stringify({ budgetReached: true });
        opts.onStep("📡", "Building market report…");
        const cost = opts.mode === "demo" ? 1 : 4;
        if (!(await spend(cost))) return JSON.stringify({ budgetReached: true });
        const thesis: Thesis = {
          sectors: override?.sectors?.length ? override.sectors.map((s) => s.toLowerCase()) : opts.thesis.sectors,
          stages: asStages(override?.stages).length ? asStages(override?.stages) : opts.thesis.stages,
          regions: asRegions(override?.regions).length ? asRegions(override?.regions) : opts.thesis.regions,
          ticketMinEur: override?.ticketMinEur ?? opts.thesis.ticketMinEur,
          ticketMaxEur: override?.ticketMaxEur ?? opts.thesis.ticketMaxEur,
        };
        try {
          sampleRounds = await provider.getSectorRounds(thesis, ctx);
          const report = buildMarketReport(sampleRounds.rounds, sampleRounds.companies, thesis, new Date(), {
            dataMode: provider.mode,
            trace: { queries: ctx.queries.slice(-8), calls: ctx.calls, cacheHits: ctx.cacheHits, ms: 0 },
          });
          opts.onStep("📡", `Market: ${report.sampleSize} rounds · ${report.toWatch.length} to watch`);
          return JSON.stringify({
            sampleSize: report.sampleSize,
            kpis: report.kpis,
            topLeads: report.topLeads.slice(0, 8),
            toWatch: report.toWatch.slice(0, 12).map((w) => ({
              id: w.company.id,
              name: w.company.name,
              score: w.score,
              monthsSince: w.monthsSince,
              reasons: w.reasons,
              lastRoundId: w.lastRound.id,
              lastStage: w.lastRound.stageLabel,
              country: w.company.country,
              sectors: w.company.sectors,
            })),
            budgetLeft: budgetLeft(),
          });
        } catch (e) {
          return JSON.stringify({ error: e instanceof Error ? e.message : "market failed", budgetLeft: budgetLeft() });
        }
      },
    }),
    eager_input_streaming: true as const,
  };

  const company_report = {
    ...betaZodTool({
      name: "company_report",
      description: "Full company background with raise-soon and thesis-fit when thesis is known.",
      inputSchema: z.object({
        company: z.string().describe("Company id or name"),
      }),
      run: async ({ company }) => {
        if (budgetHit()) return JSON.stringify({ budgetReached: true });
        opts.onStep("🧭", `Company card: ${company}`);
        if (!(await spend(opts.mode === "demo" ? 1 : 2))) return JSON.stringify({ budgetReached: true });
        try {
          const profile = await provider.getCompanyProfile(company, ctx);
          if (!profile) return JSON.stringify({ error: "not found", budgetLeft: budgetLeft() });
          const report = buildCompanyReport(profile, {
            thesis: opts.thesis,
            sampleRounds: sampleRounds?.rounds,
            similarCandidates: sampleRounds ? Object.values(sampleRounds.companies) : undefined,
            dataMode: provider.mode,
          });
          return JSON.stringify({
            id: report.company.id,
            name: report.company.name,
            description: report.company.description,
            country: report.company.country,
            sectors: report.company.sectors,
            raiseSoon: report.raiseSoon,
            thesisFit: report.thesisFit,
            rounds: report.rounds.slice(0, 4).map((r) => ({
              id: r.id,
              stageLabel: r.stageLabel,
              date: r.date,
              amountLabel: r.amountLabel,
              leads: r.investors.filter((p) => p.isLead).map((p) => p.investorName),
            })),
            founders: report.founders.slice(0, 4),
            warnings: report.warnings,
            budgetLeft: budgetLeft(),
          });
        } catch (e) {
          return JSON.stringify({ error: e instanceof Error ? e.message : "failed", budgetLeft: budgetLeft() });
        }
      },
    }),
    eager_input_streaming: true as const,
  };

  const similar_companies = {
    ...betaZodTool({
      name: "similar_companies",
      description: "Find companies similar to a given company within the sector sample.",
      inputSchema: z.object({
        companyId: z.string(),
      }),
      run: async ({ companyId }) => {
        if (budgetHit()) return JSON.stringify({ budgetReached: true });
        opts.onStep("🔗", `Similar to ${companyId.slice(0, 12)}…`);
        if (!(await spend(1))) return JSON.stringify({ budgetReached: true });
        try {
          if (!sampleRounds) {
            sampleRounds = await provider.getSectorRounds(opts.thesis, ctx);
          }
          const seed =
            sampleRounds.companies[companyId] ??
            Object.values(sampleRounds.companies).find((c) => c.id === companyId || c.name === companyId);
          if (!seed) return JSON.stringify({ error: "seed not in sample", budgetLeft: budgetLeft() });
          const scored = Object.values(sampleRounds.companies)
            .filter((c) => c.id !== seed.id)
            .map((c) => ({
              c,
              s: similarity(seed.description || seed.name, c.description || c.name).score,
            }))
            .filter((x) => x.s >= 0.15)
            .sort((a, b) => b.s - a.s)
            .slice(0, 8);
          return JSON.stringify({
            seed: { id: seed.id, name: seed.name },
            results: scored.map(({ c, s }) => ({
              id: c.id,
              name: c.name,
              description: c.description,
              similarity: Math.round(s * 100),
              country: c.country,
              sectors: c.sectors,
            })),
            budgetLeft: budgetLeft(),
          });
        } catch (e) {
          return JSON.stringify({ error: e instanceof Error ? e.message : "failed", budgetLeft: budgetLeft() });
        }
      },
    }),
    eager_input_streaming: true as const,
  };

  return [market_report, company_report, similar_companies];
}

/** @deprecated founder-only alias */
export function createScoutTools(opts: {
  startup: Startup;
  mode: DataMode;
  founder?: FounderProfile | null;
  company?: CompanyProfile | null;
  onStep: ScoutStepFn;
}) {
  return createFounderScoutTools(opts);
}
