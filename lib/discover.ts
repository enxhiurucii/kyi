// Rank startups for an investor thesis (mirror of founder→investor fit).

import { toDate } from "./format";
import { getDemoWorld } from "./providers/demoWorld";
import { inferSectors, similarity } from "./similarity";
import type { Company, DataMode, FitReason, Round, Stage, Tone } from "./types";
import { STAGE_ORDER } from "./types";

export interface InvestorThesis {
  description: string;
  stage: Stage;
  country: string;
}

export interface RankedStartup {
  company: Company;
  score: number;
  reasons: FitReason[];
  lastRound: { stageLabel: string; date: string | null; amountLabel: string | null } | null;
  monthsSinceRaise: number | null;
}

export interface DiscoverResponse {
  dataMode: DataMode;
  ranked: RankedStartup[];
  thesis: InvestorThesis;
}

function stageDistance(a: Stage, b: Stage): number {
  const i = STAGE_ORDER.indexOf(a);
  const j = STAGE_ORDER.indexOf(b);
  if (i < 0 || j < 0) return 2;
  return Math.abs(i - j);
}

function reason(label: string, tone: Tone): FitReason {
  return { label, tone };
}

/** Score one company against an investor's thesis (0–100). */
export function scoreStartupForThesis(
  company: Company,
  thesis: InvestorThesis,
  lastRound: Round | null,
  now = new Date(),
): Omit<RankedStartup, "company" | "lastRound" | "monthsSinceRaise"> & {
  monthsSinceRaise: number | null;
  lastRound: RankedStartup["lastRound"];
} {
  const reasons: FitReason[] = [];
  let score = 0;

  // 1) Thesis text match (35)
  const sim = similarity(thesis.description, `${company.description} ${company.sectors.join(" ")}`);
  score += Math.min(1, sim.score / 0.35) * 35;
  if (sim.score >= 0.2) {
    reasons.push(reason(`Matches thesis (${Math.round(sim.score * 100)}% · ${sim.matched.slice(0, 3).join(", ") || "themes"})`, "good"));
  } else if (sim.score > 0) {
    reasons.push(reason("Weak thesis overlap", "warn"));
  } else {
    reasons.push(reason("Little overlap with your thesis", "warn"));
  }

  // 2) Sector tags (20)
  const want = inferSectors(thesis.description);
  const overlap = company.sectors.filter((s) => want.includes(s));
  if (want.length === 0) {
    score += 8;
  } else if (overlap.length > 0) {
    score += Math.min(20, 10 + overlap.length * 5);
    reasons.push(reason(`Sector: ${overlap.join(", ")}`, "good"));
  } else {
    reasons.push(reason(`Sectors: ${company.sectors.join(", ") || "unknown"}`, "neutral"));
  }

  // 3) Stage of last raise vs preferred (20)
  if (!lastRound || lastRound.stage === "unknown") {
    score += 6;
    reasons.push(reason("Stage unknown", "neutral"));
  } else {
    const d = stageDistance(lastRound.stage, thesis.stage);
    if (d === 0) {
      score += 20;
      reasons.push(reason(`Raising / last round at your stage (${lastRound.stageLabel})`, "good"));
    } else if (d === 1) {
      score += 12;
      reasons.push(reason(`Nearby stage: ${lastRound.stageLabel}`, "good"));
    } else {
      score += 4;
      reasons.push(reason(`Different stage: ${lastRound.stageLabel}`, "warn"));
    }
  }

  // 4) Geography (15)
  if (!thesis.country.trim()) {
    score += 6;
  } else if (company.country && company.country.toLowerCase() === thesis.country.trim().toLowerCase()) {
    score += 15;
    reasons.push(reason(`Based in ${company.country}`, "good"));
  } else if (company.country) {
    score += 4;
    reasons.push(reason(`HQ: ${company.country}`, "neutral"));
  } else {
    score += 5;
  }

  // 5) Recently raised (10) — still “in market”
  let monthsSinceRaise: number | null = null;
  const raisedAt = lastRound?.date ? toDate(lastRound.date) : null;
  if (raisedAt) {
    monthsSinceRaise = Math.max(0, Math.round((now.getTime() - raisedAt.getTime()) / (30.4375 * 24 * 3600 * 1000)));
    if (monthsSinceRaise <= 18) {
      score += 10;
      reasons.push(reason(`Raised ${monthsSinceRaise} mo ago`, "good"));
    } else if (monthsSinceRaise <= 36) {
      score += 5;
      reasons.push(reason(`Last raise ${monthsSinceRaise} mo ago`, "neutral"));
    } else {
      reasons.push(reason(`Quiet · last raise ${monthsSinceRaise} mo ago`, "warn"));
    }
  } else {
    score += 3;
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
    monthsSinceRaise,
    lastRound: lastRound
      ? { stageLabel: lastRound.stageLabel, date: lastRound.date, amountLabel: lastRound.amountLabel }
      : null,
  };
}

export function discoverDemoStartups(thesis: InvestorThesis, limit = 12): RankedStartup[] {
  const w = getDemoWorld();
  const byCompany = new Map<string, Round[]>();
  for (const r of w.rounds) {
    const list = byCompany.get(r.companyId) ?? [];
    list.push(r);
    byCompany.set(r.companyId, list);
  }

  const ranked: RankedStartup[] = [];
  for (const company of Object.values(w.companies)) {
    const rounds = [...(byCompany.get(company.id) ?? [])].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    const last = rounds[0] ?? null;
    const scored = scoreStartupForThesis(company, thesis, last);
    ranked.push({
      company,
      score: scored.score,
      reasons: scored.reasons,
      lastRound: scored.lastRound,
      monthsSinceRaise: scored.monthsSinceRaise,
    });
  }

  return ranked.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function lastRoundFromList(rounds: Round[]): Round | null {
  if (!rounds.length) return null;
  return [...rounds].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0] ?? null;
}
