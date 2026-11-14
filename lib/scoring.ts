// Fit score: how good is this investor for THIS startup, right now? (0–100)
// Every point is explainable — the reasons are shown as chips in the UI.

import { fmtPct, fmtMonthsAgo } from "./format";
import type { Conflict, FitBreakdown, FitReason, FitScore, Stage, Startup } from "./types";
import { STAGE_LABEL, STAGE_ORDER } from "./types";

export interface FitInput {
  startup: Startup;
  status: "active" | "slowing" | "inactive" | "unknown";
  monthsSinceLastDeal: number | null;
  dealsLast12m: number;
  /** share of recent deals at the startup's stage (adjacent stages count half) — used for the score */
  stageShare: number | null;
  /** exact share of recent deals at the startup's stage — used for the label */
  stageExact: number | null;
  /** share of recent deals in the startup's sectors */
  sectorShare: number | null;
  startupSectors: string[];
  /** share of recent deals in the startup's country */
  geoShare: number | null;
  leadRate: number | null;
  followOnRate: number | null;
  conflicts: Conflict[];
  typicalStage: Stage | null;
}

export const CONFLICT_STRONG = 0.45;
export const CONFLICT_MIN = 0.28;

export const FIT_BUCKET_MAX = {
  activity: 25,
  stage: 20,
  sector: 20,
  leads: 15,
  followOn: 10,
  geo: 10,
} as const;

export function scoreFit(f: FitInput): FitScore {
  const reasons: FitReason[] = [];
  const breakdown: FitBreakdown = {
    activity: 0,
    stage: 0,
    sector: 0,
    leads: 0,
    followOn: 0,
    geo: 0,
    conflict: 0,
  };

  // 1) Still investing? (25)
  if (f.status === "active") {
    breakdown.activity = 17 + Math.min(8, f.dealsLast12m);
    reasons.push({ label: `Active · ${f.dealsLast12m} deal${f.dealsLast12m === 1 ? "" : "s"} in 12 mo`, tone: "good" });
  } else if (f.status === "slowing") {
    breakdown.activity = 12;
    reasons.push({ label: `Slowing · last deal ${fmtMonthsAgo(f.monthsSinceLastDeal)}`, tone: "warn" });
  } else if (f.status === "inactive") {
    breakdown.activity = 0;
    reasons.push({ label: `Inactive · last deal ${fmtMonthsAgo(f.monthsSinceLastDeal)}`, tone: "bad" });
  } else {
    breakdown.activity = 8;
    reasons.push({ label: "Activity unknown", tone: "neutral" });
  }

  // 2) Stage fit (20)
  const stageName = STAGE_LABEL[f.startup.stage];
  if (f.stageShare === null) {
    breakdown.stage = 8;
  } else {
    breakdown.stage = Math.min(1, f.stageShare / 0.4) * 20;
    const exact = f.stageExact ?? 0;
    if (exact >= 0.25) reasons.push({ label: `${stageName} is ${fmtPct(exact)} of their deals`, tone: "good" });
    else if (f.stageShare < 0.1) {
      const typ = f.typicalStage ? ` (mostly ${STAGE_LABEL[f.typicalStage]})` : "";
      reasons.push({ label: `Rarely does ${stageName}${typ}`, tone: "warn" });
    }
  }

  // 3) Sector fit (20)
  const sectorName = f.startupSectors[0];
  if (f.sectorShare === null || !sectorName) {
    breakdown.sector = 8;
  } else {
    breakdown.sector = Math.min(1, f.sectorShare / 0.3) * 20;
    if (f.sectorShare >= 0.15) reasons.push({ label: `Invests in ${sectorName} (${fmtPct(f.sectorShare)})`, tone: "good" });
    else if (f.sectorShare === 0) reasons.push({ label: `No ${sectorName} deals`, tone: "warn" });
  }

  // 4) Leads rounds? (15)
  if (f.leadRate === null) {
    breakdown.leads = 6;
  } else {
    breakdown.leads = Math.min(1, f.leadRate / 0.5) * 15;
    if (f.leadRate >= 0.4) reasons.push({ label: `Leads ${fmtPct(f.leadRate)} of deals`, tone: "good" });
    else if (f.leadRate <= 0.15) reasons.push({ label: `Rarely leads (${fmtPct(f.leadRate)})`, tone: "warn" });
  }

  // 5) Comes back in the next round? (10)
  if (f.followOnRate === null) {
    breakdown.followOn = 4;
  } else {
    breakdown.followOn = Math.min(1, f.followOnRate / 0.5) * 10;
    if (f.followOnRate >= 0.45) reasons.push({ label: `Invests again ${fmtPct(f.followOnRate)}`, tone: "good" });
    else if (f.followOnRate <= 0.2) reasons.push({ label: `Rarely invests again (${fmtPct(f.followOnRate)})`, tone: "warn" });
  }

  // 6) Geography (10)
  if (f.geoShare === null || !f.startup.country.trim()) {
    breakdown.geo = 5;
  } else {
    breakdown.geo = Math.min(1, f.geoShare / 0.4) * 10;
    if (f.geoShare >= 0.25) reasons.push({ label: `Invests in ${f.startup.country} (${fmtPct(f.geoShare)})`, tone: "good" });
  }

  // Conflict penalty
  const top = f.conflicts[0];
  if (top && top.similarity >= CONFLICT_STRONG) {
    breakdown.conflict = -30;
    reasons.unshift({ label: `Backs ${top.companyName}`, tone: "bad" });
  } else if (top && top.similarity >= CONFLICT_MIN) {
    breakdown.conflict = -12;
    reasons.unshift({ label: `Possible conflict: ${top.companyName}`, tone: "warn" });
  }

  const raw =
    breakdown.activity +
    breakdown.stage +
    breakdown.sector +
    breakdown.leads +
    breakdown.followOn +
    breakdown.geo +
    breakdown.conflict;

  return {
    score: Math.max(0, Math.min(100, Math.round(raw))),
    reasons,
    breakdown: {
      activity: Math.round(breakdown.activity),
      stage: Math.round(breakdown.stage),
      sector: Math.round(breakdown.sector),
      leads: Math.round(breakdown.leads),
      followOn: Math.round(breakdown.followOn),
      geo: Math.round(breakdown.geo),
      conflict: Math.round(breakdown.conflict),
    },
  };
}

/** Share of rounds at `stage`. With `adjacentHalf`, neighbouring stages count as half a match. */
export function stageShareOf(stages: Stage[], stage: Stage, adjacentHalf = true): number | null {
  const known = stages.filter((s) => s !== "unknown");
  if (known.length === 0) return null;
  const idx = STAGE_ORDER.indexOf(stage);
  let hits = 0;
  for (const s of known) {
    const j = STAGE_ORDER.indexOf(s);
    if (j === idx) hits += 1;
    else if (adjacentHalf && Math.abs(j - idx) === 1) hits += 0.5;
  }
  return hits / known.length;
}
