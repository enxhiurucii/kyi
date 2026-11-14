import type { CompanyProfile, InvestorProfile } from "../profiles/types";
import { buildInvestorReport, getProvider } from "../service";
import { scoreThesisFit } from "../market";
import { DemoProvider } from "../providers/demo";
import { newCtx } from "../provider";
import type { Startup, Thesis } from "../types";
import { DEMO_LUMIPOLKU_NAME, DEMO_SISU_FIRM, type IncomingInterest, type InterestRecord } from "./types";

const MUTUAL_THRESHOLD = 70;

export function thesisFromInvestorProfile(inv: InvestorProfile): Thesis {
  return {
    sectors: inv.thesisSectors,
    stages: inv.thesisStages,
    regions: inv.thesisRegions,
    ticketMinEur: inv.ticketMinEur,
    ticketMaxEur: inv.ticketMaxEur,
  };
}

export function mutualMatch(fitScore: number | null, thesisFitScore: number | null): boolean {
  return (fitScore ?? 0) >= MUTUAL_THRESHOLD && (thesisFitScore ?? 0) >= MUTUAL_THRESHOLD;
}

function startupFromCompany(company: CompanyProfile | null, hint?: Startup | null): Startup {
  if (hint?.description.trim()) return hint;
  if (company) {
    return {
      description: company.oneLiner || company.name,
      stage: company.stage,
      country: company.country,
    };
  }
  return {
    description: "AI route planning for trucking fleets — cuts empty kilometres and fuel costs",
    stage: "seed",
    country: "Finland",
  };
}

function reportPath(investor: string, s: Startup): string {
  const p = new URLSearchParams({ d: s.description, s: s.stage, c: s.country, mode: "demo", inv: investor });
  return `/report?${p}`;
}

/** Enrich incoming interests with fit + thesis-fit (demo path). */
export async function enrichIncomingDemo(
  rows: InterestRecord[],
  company: CompanyProfile | null,
  startupHint?: Startup | null,
): Promise<IncomingInterest[]> {
  const provider = getProvider("demo");
  const startup = startupFromCompany(company, startupHint);

  const out: IncomingInterest[] = [];
  for (const row of rows) {
    const report = await buildInvestorReport(provider, row.investorFirm || DEMO_SISU_FIRM, startup, "quick", {
      name: company?.name ?? DEMO_LUMIPOLKU_NAME,
      entityId: company?.calaCompanyId,
    });
    const fitScore = report?.fitScore?.score ?? null;

    let thesisFitScore: number | null = null;
    if (/sisu/i.test(row.investorFirm) || row.investorUserId.startsWith("demo-")) {
      const thesis: Thesis = {
        sectors: ["logistics", "mobility"],
        stages: ["pre-seed", "seed"],
        regions: ["Nordics", "Baltics"],
        ticketMinEur: 500_000,
        ticketMaxEur: 3_000_000,
      };
      const demo = new DemoProvider();
      const profile = await demo.getCompanyProfile(
        company?.calaCompanyId || company?.name || DEMO_LUMIPOLKU_NAME,
        newCtx(),
      );
      if (profile) {
        const last = profile.rounds[0] ?? null;
        thesisFitScore = scoreThesisFit(profile.company, last, thesis).score;
      } else {
        thesisFitScore = 85;
      }
    }

    out.push({
      ...row,
      fitScore,
      thesisFitScore,
      mutualMatch: mutualMatch(fitScore, thesisFitScore),
      reportHref: reportPath(row.investorFirm || DEMO_SISU_FIRM, startup),
    });
  }
  return out;
}

/** Quality gate helper — Mikko ↔ Lumipolku should mutual-match. */
export async function demoMikkoLumipolkuScores(): Promise<{ fit: number; thesisFit: number; mutual: boolean }> {
  const provider = getProvider("demo");
  const startup: Startup = {
    description: "AI route planning for trucking fleets — cuts empty kilometres and fuel costs",
    stage: "seed",
    country: "Finland",
  };
  const report = await buildInvestorReport(provider, DEMO_SISU_FIRM, startup, "quick", {
    name: DEMO_LUMIPOLKU_NAME,
  });
  const fit = report?.fitScore?.score ?? 0;

  const thesis: Thesis = {
    sectors: ["logistics", "mobility"],
    stages: ["pre-seed", "seed"],
    regions: ["Nordics", "Baltics"],
    ticketMinEur: 500_000,
    ticketMaxEur: 3_000_000,
  };
  const demo = new DemoProvider();
  const profile = await demo.getCompanyProfile(DEMO_LUMIPOLKU_NAME, newCtx());
  const thesisFit = profile ? scoreThesisFit(profile.company, profile.rounds[0] ?? null, thesis).score : 0;

  return { fit, thesisFit, mutual: mutualMatch(fit, thesisFit) };
}
