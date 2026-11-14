// Pure market-radar engine (no I/O). Mirrors lib/metrics.ts for investor reports.

import { monthsBetween, toDate } from "./format";
import { countryMatchesRegions } from "./regions";
import type {
  Company,
  DataMode,
  FitReason,
  MarketReport,
  Round,
  Stage,
  Thesis,
  Tone,
} from "./types";

const WATCH_STAGES: Stage[] = ["pre-seed", "seed", "series-a"];

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function quarterOf(iso: string): string {
  const d = toDate(iso)!;
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}

function inWindow(date: string | null, now: Date, maxMonths: number, minMonths = 0): boolean {
  const d = toDate(date);
  if (!d) return false;
  const m = monthsBetween(d, now);
  return m >= minMonths && m <= maxMonths;
}

function sectorOverlap(company: Company, thesis: Thesis): boolean {
  if (!thesis.sectors.length) return true;
  const set = new Set(company.sectors.map((s) => s.toLowerCase()));
  return thesis.sectors.some((s) => set.has(s.toLowerCase()));
}

function stageMatchesThesis(stage: Stage, thesis: Thesis): boolean {
  if (!thesis.stages.length) return true;
  return thesis.stages.includes(stage);
}

/** Lead counts in the sample (for backer-strength scoring). */
function leadCounts(rounds: Round[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rounds) {
    for (const p of r.investors) {
      if (p.isLead !== true) continue;
      m.set(p.investorId, (m.get(p.investorId) ?? 0) + 1);
    }
  }
  return m;
}

/** Median amount by stage within the sample. */
function stageMedians(rounds: Round[]): Map<Stage, number> {
  const by = new Map<Stage, number[]>();
  for (const r of rounds) {
    if (r.amountEur == null || r.amountEur <= 0) continue;
    const arr = by.get(r.stage) ?? [];
    arr.push(r.amountEur);
    by.set(r.stage, arr);
  }
  const out = new Map<Stage, number>();
  for (const [stage, amounts] of by) {
    const med = median(amounts);
    if (med != null) out.set(stage, med);
  }
  return out;
}

export function scoreThesisFit(
  company: Company,
  lastRound: Round | null,
  thesis: Thesis,
): { score: number; reasons: FitReason[] } {
  const reasons: FitReason[] = [];
  let score = 0;

  const sectorHit = sectorOverlap(company, thesis);
  if (sectorHit) {
    score += 35;
    reasons.push({ label: "Sector match", tone: "good" });
  } else {
    reasons.push({ label: "Sector mismatch", tone: "bad" });
  }

  if (lastRound && stageMatchesThesis(lastRound.stage, thesis)) {
    score += 30;
    reasons.push({ label: "Stage match", tone: "good" });
  } else if (!thesis.stages.length) {
    score += 15;
  } else {
    reasons.push({ label: "Stage off-thesis", tone: "warn" });
  }

  if (countryMatchesRegions(company.country, thesis.regions)) {
    score += 20;
    reasons.push({ label: "In region", tone: "good" });
  } else {
    reasons.push({ label: "Outside region", tone: "warn" });
  }

  if (lastRound?.amountEur != null && (thesis.ticketMinEur != null || thesis.ticketMaxEur != null)) {
    const amt = lastRound.amountEur;
    const minOk = thesis.ticketMinEur == null || amt >= thesis.ticketMinEur * 0.5;
    const maxOk = thesis.ticketMaxEur == null || amt <= thesis.ticketMaxEur * 2;
    if (minOk && maxOk) {
      score += 15;
      reasons.push({ label: "Ticket ballpark", tone: "good" });
    } else {
      reasons.push({ label: "Ticket off-range", tone: "neutral" });
    }
  } else {
    score += 8;
  }

  return { score: Math.min(100, Math.round(score)), reasons };
}

/**
 * Raise-soon signal 0–100 (PRODUCT.md):
 * timing 35 · backer strength 25 · round size 15 · thesis fit 25
 */
export function scoreRaiseSoon(
  company: Company,
  lastRound: Round,
  monthsSince: number,
  thesis: Thesis,
  sampleLeads: Map<string, number>,
  stageMed: Map<Stage, number>,
): { score: number; reasons: FitReason[] } {
  const reasons: FitReason[] = [];
  let score = 0;

  // Timing (35)
  let timing = 5;
  let timingTone: Tone = "neutral";
  let timingLabel = "Timing unclear";
  if (monthsSince >= 12 && monthsSince <= 24) {
    timing = 35;
    timingTone = "good";
    timingLabel = "12–24 mo since raise";
  } else if ((monthsSince >= 9 && monthsSince < 12) || (monthsSince > 24 && monthsSince <= 30)) {
    timing = 20;
    timingTone = "warn";
    timingLabel = monthsSince < 12 ? "9–12 mo since raise" : "24–30 mo since raise";
  } else {
    timing = 5;
    timingTone = "neutral";
    timingLabel = `${Math.round(monthsSince)} mo since raise`;
  }
  score += timing;
  reasons.push({ label: timingLabel, tone: timingTone });

  // Backer strength (25)
  const lead = lastRound.investors.find((p) => p.isLead === true);
  const leadN = lead ? sampleLeads.get(lead.investorId) ?? 0 : 0;
  let backer = 8;
  if (!lead) {
    backer = 8;
    reasons.push({ label: "Lead unknown", tone: "neutral" });
  } else if (leadN >= 3) {
    backer = 25;
    reasons.push({ label: `Strong lead (${lead.investorName})`, tone: "good" });
  } else if (leadN === 2) {
    backer = 18;
    reasons.push({ label: `Active lead (${lead.investorName})`, tone: "good" });
  } else if (leadN === 1) {
    backer = 10;
    reasons.push({ label: `Lead: ${lead.investorName}`, tone: "neutral" });
  } else {
    backer = 8;
    reasons.push({ label: `Lead: ${lead.investorName}`, tone: "neutral" });
  }
  score += backer;

  // Round size (15)
  const med = stageMed.get(lastRound.stage);
  if (lastRound.amountEur == null || med == null) {
    score += 6;
    reasons.push({ label: "Round size unknown", tone: "neutral" });
  } else if (lastRound.amountEur >= med) {
    score += 15;
    reasons.push({ label: "≥ median round", tone: "good" });
  } else if (lastRound.amountEur >= med / 2) {
    score += 8;
    reasons.push({ label: "Half+ median round", tone: "neutral" });
  } else {
    score += 6;
    reasons.push({ label: "Below median round", tone: "warn" });
  }

  // Thesis fit slice (25) — sector 10 + stage 10 + country 5
  let thesisPts = 0;
  if (sectorOverlap(company, thesis)) {
    thesisPts += 10;
    reasons.push({ label: "Thesis sector", tone: "good" });
  }
  if (stageMatchesThesis(lastRound.stage, thesis)) {
    thesisPts += 10;
    reasons.push({ label: "Thesis stage", tone: "good" });
  }
  if (countryMatchesRegions(company.country, thesis.regions)) {
    thesisPts += 5;
    reasons.push({ label: "Thesis region", tone: "good" });
  }
  score += thesisPts;

  return { score: Math.min(100, Math.round(score)), reasons: reasons.slice(0, 6) };
}

export function buildMarketReport(
  rounds: Round[],
  companies: Record<string, Company>,
  thesis: Thesis,
  now: Date = new Date(),
  meta?: { dataMode?: DataMode; trace?: MarketReport["trace"]; warnings?: string[] },
): MarketReport {
  const sample = rounds.filter((r) => {
    const co = companies[r.companyId];
    if (!co) return false;
    if (!sectorOverlap(co, thesis) && thesis.sectors.length) {
      // keep rounds already filtered by provider; still require region when known
    }
    return countryMatchesRegions(co.country, thesis.regions) || !co.country;
  });

  // Prefer provider-filtered rounds as-is; re-apply soft thesis filters for safety
  const filtered = rounds.filter((r) => {
    const co = companies[r.companyId];
    if (!co) return true;
    if (thesis.sectors.length && !sectorOverlap(co, thesis)) return false;
    if (!countryMatchesRegions(co.country, thesis.regions)) return false;
    return true;
  });
  const use = filtered.length ? filtered : sample.length ? sample : rounds;

  const deals12m = use.filter((r) => inWindow(r.date, now, 12)).length;
  const dealsPrev12 = use.filter((r) => inWindow(r.date, now, 24, 12)).length;
  const raised12 = use
    .filter((r) => inWindow(r.date, now, 12))
    .map((r) => r.amountEur)
    .filter((n): n is number => n != null && n > 0);
  const raised12mEur = raised12.length ? raised12.reduce((a, b) => a + b, 0) : null;
  const allAmounts = use.map((r) => r.amountEur).filter((n): n is number => n != null && n > 0);
  const medianRoundEur = median(allAmounts);
  const trendPct =
    dealsPrev12 === 0 ? (deals12m > 0 ? 100 : null) : Math.round(((deals12m - dealsPrev12) / dealsPrev12) * 100);

  const qMap = new Map<string, { deals: number; raisedEur: number }>();
  for (const r of use) {
    if (!r.date) continue;
    const q = quarterOf(r.date);
    const row = qMap.get(q) ?? { deals: 0, raisedEur: 0 };
    row.deals += 1;
    if (r.amountEur) row.raisedEur += r.amountEur;
    qMap.set(q, row);
  }
  const quarterly = [...qMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([quarter, v]) => ({ quarter, deals: v.deals, raisedEur: v.raisedEur }));

  const recentRounds = [...use]
    .filter((r) => r.date)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 12);

  const last24 = use.filter((r) => inWindow(r.date, now, 24));
  const leadMap = new Map<string, { investorId: string; name: string; leads: number; lastLeadDate: string | null; roundIds: string[] }>();
  for (const r of last24) {
    for (const p of r.investors) {
      if (p.isLead !== true) continue;
      const row = leadMap.get(p.investorId) ?? {
        investorId: p.investorId,
        name: p.investorName,
        leads: 0,
        lastLeadDate: null,
        roundIds: [],
      };
      row.leads += 1;
      row.roundIds.push(r.id);
      if (!row.lastLeadDate || (r.date && r.date > row.lastLeadDate)) row.lastLeadDate = r.date;
      leadMap.set(p.investorId, row);
    }
  }
  const topLeads = [...leadMap.values()].sort((a, b) => b.leads - a.leads || (b.lastLeadDate ?? "").localeCompare(a.lastLeadDate ?? "")).slice(0, 10);

  const sampleLeads = leadCounts(use);
  const stageMed = stageMedians(use);

  // Latest round per company
  const latestByCo = new Map<string, Round>();
  for (const r of [...use].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))) {
    if (!latestByCo.has(r.companyId)) latestByCo.set(r.companyId, r);
  }

  const toWatch: MarketReport["toWatch"] = [];
  for (const [companyId, lastRound] of latestByCo) {
    if (!WATCH_STAGES.includes(lastRound.stage)) continue;
    const d = toDate(lastRound.date);
    if (!d) continue;
    const monthsSince = monthsBetween(d, now);
    if (monthsSince < 9 || monthsSince > 30) continue;
    const company = companies[companyId] ?? {
      id: companyId,
      name: lastRound.companyName,
      description: "",
      sectors: [],
      country: null,
    };
    if (thesis.sectors.length && !sectorOverlap(company, thesis)) continue;
    if (!countryMatchesRegions(company.country, thesis.regions)) continue;
    if (thesis.stages.length && !stageMatchesThesis(lastRound.stage, thesis) && !WATCH_STAGES.some((s) => thesis.stages.includes(s))) {
      // allow watch stages that overlap thesis; if thesis has stages, require last round stage in thesis
      if (!thesis.stages.includes(lastRound.stage)) continue;
    }

    const { score, reasons } = scoreRaiseSoon(company, lastRound, monthsSince, thesis, sampleLeads, stageMed);
    toWatch.push({
      company,
      lastRound,
      monthsSince: Math.round(monthsSince * 10) / 10,
      score,
      reasons,
      roundIds: [lastRound.id],
    });
  }
  toWatch.sort((a, b) => b.score - a.score || a.monthsSince - b.monthsSince);
  const topWatch = toWatch.slice(0, 12);

  const warnings = [...(meta?.warnings ?? [])];
  if (use.length < 5) warnings.push("Small sample — treat KPIs as directional.");
  if (!topWatch.length) warnings.push("No companies matched the to-watch window (early stage, 9–30 months since last raise).");

  return {
    thesis,
    sampleSize: use.length,
    kpis: {
      deals12m,
      raised12mEur,
      medianRoundEur,
      trendPct,
    },
    quarterly,
    recentRounds,
    topLeads,
    toWatch: topWatch,
    warnings,
    dataMode: meta?.dataMode ?? "demo",
    generatedAt: now.toISOString(),
    trace: meta?.trace ?? { queries: [], calls: 0, cacheHits: 0, ms: 0 },
  };
}
