// Pure company background-check engine (no I/O).

import { monthsBetween, toDate } from "./format";
import { scoreRaiseSoon, scoreThesisFit } from "./market";
import { similarity } from "./similarity";
import type {
  Company,
  CompanyProfileResult,
  CompanyReport,
  DataMode,
  Round,
  Thesis,
} from "./types";

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

function stageMedians(rounds: Round[]): Map<import("./types").Stage, number> {
  const by = new Map<import("./types").Stage, number[]>();
  for (const r of rounds) {
    if (r.amountEur == null || r.amountEur <= 0) continue;
    const arr = by.get(r.stage) ?? [];
    arr.push(r.amountEur);
    by.set(r.stage, arr);
  }
  const out = new Map<import("./types").Stage, number>();
  for (const [stage, amounts] of by) {
    const s = [...amounts].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    out.set(stage, s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2);
  }
  return out;
}

export function buildCompanyReport(
  profile: CompanyProfileResult,
  opts?: {
    thesis?: Thesis | null;
    sampleRounds?: Round[];
    similarCandidates?: Company[];
    now?: Date;
    dataMode?: DataMode;
    trace?: CompanyReport["trace"];
    warnings?: string[];
  },
): CompanyReport {
  const now = opts?.now ?? new Date();
  const rounds = [...profile.rounds].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const last = rounds[0] ?? null;
  const warnings = [...(opts?.warnings ?? []), ...(profile.sources.length === 0 && rounds.every((r) => !r.sources.length) ? ["No source links on file for this company."] : [])];

  const similar = (opts?.similarCandidates ?? [])
    .filter((c) => c.id !== profile.company.id)
    .map((c) => ({
      company: c,
      similarity: similarity(profile.company.description || profile.company.name, c.description || c.name).score,
    }))
    .filter((x) => x.similarity >= 0.2)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 6);

  let raiseSoon: CompanyReport["raiseSoon"];
  let thesisFit: CompanyReport["thesisFit"];
  if (opts?.thesis && last?.date) {
    const monthsSince = monthsBetween(toDate(last.date)!, now);
    const sample = opts.sampleRounds?.length ? opts.sampleRounds : rounds;
    raiseSoon = scoreRaiseSoon(
      profile.company,
      last,
      monthsSince,
      opts.thesis,
      leadCounts(sample),
      stageMedians(sample),
    );
    thesisFit = scoreThesisFit(profile.company, last, opts.thesis);
  }

  const sources = [
    ...profile.sources,
    ...rounds.flatMap((r) => r.sources),
  ].filter((s, i, arr) => arr.findIndex((x) => (x.url || x.name) === (s.url || s.name)) === i);

  return {
    company: profile.company,
    rounds,
    investors: profile.investors,
    founders: profile.founders,
    similar,
    raiseSoon,
    thesisFit,
    sources,
    warnings,
    dataMode: opts?.dataMode ?? "demo",
    generatedAt: now.toISOString(),
    trace: opts?.trace ?? { queries: [], calls: 0, cacheHits: 0, ms: 0 },
  };
}
