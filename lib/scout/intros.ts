import type { CompanyProfile, FounderProfile } from "../profiles/types";
import type { InvestorReport } from "../types";

export type IntroPath = { via: string; detail: string };

/** Cheap warm-intro hints from the local profile + report co-investors / portfolio. */
export function findIntroPaths(
  founder: FounderProfile | null | undefined,
  company: CompanyProfile | null | undefined,
  report: InvestorReport,
): IntroPath[] {
  const paths: IntroPath[] = [];
  const fund = report.investor.name;

  const existing = company?.existingInvestors ?? [];
  for (const ex of existing.slice(0, 8)) {
    const hit = report.coInvestors.find((c) => c.name.toLowerCase() === ex.name.toLowerCase());
    if (hit) {
      paths.push({
        via: ex.name,
        detail: `${ex.name} already co-invested with ${fund} (${hit.count} shared deals in the graph).`,
      });
    }
  }

  const past = founder?.pastCompanies ?? [];
  for (const pc of past.slice(0, 8)) {
    const conflict = report.conflicts.find((c) => c.companyName.toLowerCase() === pc.name.toLowerCase());
    if (conflict) {
      paths.push({
        via: pc.name,
        detail: `${fund} already touched ${pc.name} — use that shared context carefully (may also be a conflict).`,
      });
    }
  }

  if (paths.length === 0 && report.coInvestors[0]) {
    paths.push({
      via: report.coInvestors[0].name,
      detail: `Most frequent co-investor is ${report.coInvestors[0].name} (${report.coInvestors[0].count} shared deals) — a natural next warm intro.`,
    });
  }

  if (paths.length === 0 && founder?.schools?.[0]) {
    paths.push({
      via: founder.schools[0].name,
      detail: `No shared portfolio edge found — open with ${founder.schools[0].name} / founder background if relevant.`,
    });
  }

  return paths.slice(0, 3);
}
