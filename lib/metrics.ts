// The heart of KYI: turn raw funding-round data into an investor report card.
// Pure functions — no I/O — so it works the same with demo data or live Cala data.

import { fmtMonthYear, monthsBetween, normName, possessive, toDate, truncate } from "./format";
import { CONFLICT_MIN, scoreFit, stageShareOf } from "./scoring";
import { inferSectors, similarity } from "./similarity";
import type {
  Company,
  CompanyOutcome,
  Conflict,
  DataMode,
  Distribution,
  Investor,
  InvestorReport,
  Participation,
  QuarterBucket,
  Round,
  Stage,
  Startup,
  TalkingPoint,
} from "./types";
import { STAGE_LABEL, STAGE_ORDER } from "./types";

export interface BuildInput {
  investor: Investor;
  /** Rounds this investor took part in */
  investorRounds: Round[];
  /** All known rounds per portfolio company id (used for follow-on + graduation) */
  companyRounds: Record<string, Round[]>;
  companies: Record<string, Company>;
  startup: Startup | null;
  /** Founder's company — skipped in the conflict check when the investor already backs them */
  ownCompany?: { name?: string; entityId?: string } | null;
  dataMode: DataMode;
  depth?: InvestorReport["depth"];
  trace: InvestorReport["trace"];
  now?: Date;
}

function isOwnCompany(c: Company, own?: BuildInput["ownCompany"]): boolean {
  if (!own) return false;
  if (own.entityId && (c.entityId === own.entityId || c.id === own.entityId)) return true;
  if (!own.name) return false;
  const a = normName(own.name);
  const b = normName(c.name);
  return !!a && a === b;
}

const RECENT_MONTHS = 36; // window used for "fit" distributions
const GRADUATION_MIN_AGE_MONTHS = 18; // a seed deal needs time before we judge it
const CONFLICT_LOOKBACK_YEARS = 6;

export function isSameInvestor(p: Participation, inv: Investor): boolean {
  if (p.investorId && (p.investorId === inv.id || (inv.entityId && p.investorId === inv.entityId))) return true;
  const a = normName(p.investorName);
  const b = normName(inv.name);
  return a.length > 0 && a === b;
}

function myRole(round: Round, inv: Investor): Participation {
  return (
    round.investors.find((p) => isSameInvestor(p, inv)) ?? {
      investorId: inv.id,
      investorName: inv.name,
      isLead: null,
    }
  );
}

function byDateDesc(a: Round, b: Round): number {
  return (b.date ?? "").localeCompare(a.date ?? "");
}

function quarterKey(d: Date): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function distribution(keys: string[], labelOf: (k: string) => string = (k) => k): Distribution[] {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: labelOf(key), count }))
    .sort((a, b) => b.count - a.count);
}

function sameCountry(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = normName(a);
  const y = normName(b);
  return x === y || x.includes(y) || y.includes(x);
}

/** Startup.country may list several markets ("Finland, Sweden"). Match if any hits. */
function matchesStartupCountry(companyCountry: string | null | undefined, startupCountry: string): boolean {
  const targets = startupCountry
    .split(/[,;/|]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (targets.length === 0) return false;
  return targets.some((t) => sameCountry(companyCountry, t));
}

export function buildReport(input: BuildInput): InvestorReport {
  const now = input.now ?? new Date();
  const inv = input.investor;
  const warnings: string[] = [];
  const roundsById: Record<string, Round> = {};
  const add = (r: Round) => {
    roundsById[r.id] = r;
  };

  // De-duplicate and sort the investor's rounds
  const mine = dedupe(input.investorRounds).sort(byDateDesc);
  mine.forEach(add);
  const dated = mine.filter((r) => toDate(r.date));

  if (mine.length === 0) warnings.push("No funding rounds found for this investor in the data.");
  if (mine.length > 0 && dated.length < mine.length) {
    warnings.push(`${mine.length - dated.length} of ${mine.length} rounds have no date and are left out of time-based metrics.`);
  }

  // ---------- 1. Activity ----------
  const last = dated[0];
  const lastLead = dated.find((r) => myRole(r, inv).isLead === true);
  const monthsSinceLastDeal = last ? monthsBetween(toDate(last.date)!, now) : null;
  const inLast = (r: Round, months: number) => {
    const d = toDate(r.date);
    return !!d && monthsBetween(d, now) <= months;
  };
  const last12 = dated.filter((r) => inLast(r, 12));
  const status: InvestorReport["activity"]["status"] =
    monthsSinceLastDeal === null ? "unknown" : monthsSinceLastDeal <= 6 ? "active" : monthsSinceLastDeal <= 12 ? "slowing" : "inactive";

  const quarterly: QuarterBucket[] = [];
  {
    const start = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3 - 33, 1));
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i * 3, 1));
      quarterly.push({ quarter: quarterKey(d), deals: 0, leads: 0 });
    }
    const idx = new Map(quarterly.map((q, i) => [q.quarter, i]));
    for (const r of dated) {
      const i = idx.get(quarterKey(toDate(r.date)!));
      if (i === undefined) continue;
      quarterly[i].deals++;
      if (myRole(r, inv).isLead) quarterly[i].leads++;
    }
  }

  // ---------- 2. Leadership ----------
  let leads = 0;
  let knownRoles = 0;
  for (const r of mine) {
    const role = myRole(r, inv).isLead;
    if (role !== null) {
      knownRoles++;
      if (role) leads++;
    }
  }
  const leadRate = knownRoles > 0 ? leads / knownRoles : null;
  if (mine.length > 0 && knownRoles < mine.length * 0.6) {
    warnings.push(`Lead/participant role is known for ${knownRoles} of ${mine.length} rounds.`);
  }
  const ledRounds = mine.filter((r) => myRole(r, inv).isLead === true);

  // ---------- 3 + 4. Follow-on and graduation ----------
  const mineIds = new Set(mine.map((r) => r.id));
  const byCompany = new Map<string, Round[]>();
  for (const r of mine) {
    if (!r.companyId) continue; // round known only from the investor's edge (company not loaded)
    const list = byCompany.get(r.companyId) ?? [];
    list.push(r);
    byCompany.set(r.companyId, list);
  }

  const followCompanies: CompanyOutcome[] = [];
  const gradCompanies: CompanyOutcome[] = [];

  for (const [companyId, myCompanyRounds] of byCompany) {
    const myDated = myCompanyRounds.filter((r) => toDate(r.date)).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    if (myDated.length === 0) continue;
    const entry = myDated[0];
    const all = dedupe([...(input.companyRounds[companyId] ?? []), ...myCompanyRounds]);
    const later = all
      .filter((r) => r.id !== entry.id && r.date && entry.date && r.date > entry.date)
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
    const companyName = entry.companyName;

    // Follow-on: when the company raised again, did the investor come back?
    if (later.length > 0) {
      const back = later.filter((r) => r.investors.some((p) => isSameInvestor(p, inv)) || mineIds.has(r.id));
      later.forEach(add);
      followCompanies.push({
        companyId,
        companyName,
        yes: back.length > 0,
        roundIds: [entry.id, ...(back.length ? back : later).map((r) => r.id)],
      });
    }

    // Graduation: did their early-stage bets raise a next round?
    const entryAge = monthsBetween(toDate(entry.date)!, now);
    if ((entry.stage === "pre-seed" || entry.stage === "seed") && entryAge >= GRADUATION_MIN_AGE_MONTHS) {
      const entryRank = STAGE_ORDER.indexOf(entry.stage);
      const next = later.filter((r) => r.stage === "unknown" || STAGE_ORDER.indexOf(r.stage) > entryRank);
      next.forEach(add);
      gradCompanies.push({
        companyId,
        companyName,
        yes: next.length > 0,
        roundIds: [entry.id, ...next.map((r) => r.id)],
      });
    }
  }

  const followed = followCompanies.filter((c) => c.yes).length;
  const graduated = gradCompanies.filter((c) => c.yes).length;
  if (followCompanies.length > 0 && followCompanies.length < 4) warnings.push(`Follow-on rate is based on only ${followCompanies.length} companies.`);
  if (gradCompanies.length > 0 && gradCompanies.length < 4) warnings.push(`Graduation rate is based on only ${gradCompanies.length} early-stage deals.`);

  // ---------- 5. Fit ----------
  let recent = dated.filter((r) => inLast(r, RECENT_MONTHS));
  if (recent.length < 5) recent = mine;
  const stages = recent.map((r) => r.stage);
  const stageDist = distribution(
    stages.filter((s) => s !== "unknown"),
    (k) => STAGE_LABEL[k as Stage] ?? k,
  );
  const sectorKeys: string[] = [];
  const countryKeys: string[] = [];
  for (const r of recent) {
    const c = input.companies[r.companyId];
    if (!c) continue;
    for (const s of c.sectors.slice(0, 2)) sectorKeys.push(s);
    if (c.country) countryKeys.push(c.country);
  }
  const sectorDist = distribution(sectorKeys, (k) => k.charAt(0).toUpperCase() + k.slice(1));
  const countryDist = distribution(countryKeys);
  const medianRoundEur = median(recent.map((r) => r.amountEur).filter((x): x is number => x !== null));
  const typicalStage = (stageDist[0]?.key as Stage | undefined) ?? null;

  // ---------- 6. Co-investors ----------
  const co = new Map<string, { name: string; count: number; roundIds: string[] }>();
  for (const r of mine) {
    for (const p of r.investors) {
      if (isSameInvestor(p, inv)) continue;
      const key = normName(p.investorName);
      if (!key) continue;
      const e = co.get(key) ?? { name: p.investorName, count: 0, roundIds: [] };
      e.count++;
      e.roundIds.push(r.id);
      co.set(key, e);
    }
  }
  const coInvestors = [...co.values()].sort((a, b) => b.count - a.count).slice(0, 6);

  // ---------- 7. Conflicts with the founder's startup ----------
  const conflicts: Conflict[] = [];
  const startupSectors = input.startup ? inferSectors(input.startup.description) : [];
  if (input.startup && input.startup.description.trim().length > 0) {
    const seen = new Set<string>();
    for (const r of mine) {
      if (!r.companyId || seen.has(r.companyId)) continue;
      const d = toDate(r.date);
      if (d && monthsBetween(d, now) > CONFLICT_LOOKBACK_YEARS * 12) continue;
      seen.add(r.companyId);
      const c = input.companies[r.companyId];
      if (!c || !c.description) continue;
      if (isOwnCompany(c, input.ownCompany)) continue;
      const sim = similarity(input.startup.description, `${c.description} ${c.sectors.join(" ")}`);
      let score = sim.score;
      if (startupSectors.length && c.sectors.some((s) => startupSectors.includes(s))) score += 0.08;
      if (score >= CONFLICT_MIN) {
        conflicts.push({
          companyId: c.id,
          companyName: c.name,
          description: c.description,
          similarity: Math.min(1, score),
          matchedTerms: sim.matched.slice(0, 5),
          roundIds: mine.filter((m) => m.companyId === c.id).map((m) => m.id),
        });
      }
    }
    conflicts.sort((a, b) => b.similarity - a.similarity);
  }

  // ---------- 8. Fit score ----------
  let fitScore: InvestorReport["fitScore"] = null;
  if (input.startup) {
    // Only rounds whose company we actually loaded can say anything about sector / country.
    const withSectors = recent.filter((r) => (input.companies[r.companyId]?.sectors.length ?? 0) > 0);
    const withCountry = recent.filter((r) => input.companies[r.companyId]?.country);
    const sectorShare =
      startupSectors.length === 0 || withSectors.length < 3
        ? null
        : withSectors.filter((r) => input.companies[r.companyId]!.sectors.some((s) => startupSectors.includes(s))).length / withSectors.length;
    const geoShare =
      !input.startup.country.trim() || withCountry.length < 3
        ? null
        : withCountry.filter((r) => matchesStartupCountry(input.companies[r.companyId]?.country, input.startup!.country)).length /
          withCountry.length;
    fitScore = scoreFit({
      startup: input.startup,
      status,
      monthsSinceLastDeal,
      dealsLast12m: last12.length,
      stageShare: stageShareOf(stages, input.startup.stage, true),
      stageExact: stageShareOf(stages, input.startup.stage, false),
      sectorShare,
      startupSectors,
      geoShare,
      leadRate,
      followOnRate: followCompanies.length ? followed / followCompanies.length : null,
      conflicts: conflicts.slice(0, 3),
      typicalStage,
    });
  }

  // ---------- 9. Talking points for the meeting ----------
  const talkingPoints: TalkingPoint[] = [];
  const top = conflicts[0];
  if (top) {
    talkingPoints.push({
      tone: "bad",
      text: `They back ${top.companyName} (${truncate(top.description, 70)}). Expect "how are you different?" — or ask how they handle portfolio conflicts.`,
      roundIds: top.roundIds,
    });
  }
  if (status === "inactive" && monthsSinceLastDeal !== null) {
    talkingPoints.push({
      tone: "bad",
      text: `No new deal in ${Math.round(monthsSinceLastDeal)} months. Ask whether they are still investing from their current fund.`,
      roundIds: last ? [last.id] : [],
    });
  } else if (status === "slowing" && monthsSinceLastDeal !== null) {
    talkingPoints.push({
      tone: "warn",
      text: `Deal pace is slowing (last deal ${Math.round(monthsSinceLastDeal)} months ago). Ask where they are in their fund cycle.`,
      roundIds: last ? [last.id] : [],
    });
  }
  const recentLead = lastLead;
  if (recentLead && inLast(recentLead, 18)) {
    talkingPoints.push({
      tone: "good",
      text: `They led ${possessive(recentLead.companyName)} ${recentLead.stageLabel || STAGE_LABEL[recentLead.stage]} round in ${fmtMonthYear(recentLead.date)}. Ask what made them lead — it shows what they look for.`,
      roundIds: [recentLead.id],
    });
  }
  if (followCompanies.length >= 3) {
    const rate = followed / followCompanies.length;
    if (rate >= 0.45) {
      talkingPoints.push({
        tone: "good",
        text: `When their startups raised again, they invested again in ${followed} of ${followCompanies.length}. Ask how much they reserve for follow-ons.`,
        roundIds: followCompanies.filter((c) => c.yes).flatMap((c) => c.roundIds).slice(0, 12),
      });
    } else if (rate <= 0.2) {
      talkingPoints.push({
        tone: "warn",
        text: `When their startups raised again, they invested again in only ${followed} of ${followCompanies.length}. Ask who usually leads the next round of their companies.`,
        roundIds: followCompanies.flatMap((c) => c.roundIds).slice(0, 12),
      });
    }
  }
  if (leadRate !== null && knownRoles >= 4 && leadRate <= 0.15) {
    talkingPoints.push({
      tone: "warn",
      text: `They mostly follow (${leads} leads in ${knownRoles} deals). You'll still need a lead — ask who they like to co-invest with.`,
      roundIds: mine.slice(0, 10).map((r) => r.id),
    });
  }
  if (input.startup && typicalStage && typicalStage !== input.startup.stage) {
    const exact = stageShareOf(stages, input.startup.stage, false) ?? 0;
    if (exact < 0.1) {
      talkingPoints.push({
        tone: "warn",
        text: `They mostly do ${STAGE_LABEL[typicalStage]} rounds; you're raising ${STAGE_LABEL[input.startup.stage]}. Ask if they ever invest at your stage.`,
        roundIds: recent.slice(0, 10).map((r) => r.id),
      });
    }
  }
  if (coInvestors[0] && coInvestors[0].count >= 2) {
    talkingPoints.push({
      tone: "neutral",
      text: `Their most frequent co-investor is ${coInvestors[0].name} (${coInvestors[0].count} shared deals) — a natural next meeting.`,
      roundIds: coInvestors[0].roundIds,
    });
  }

  return {
    investor: inv,
    dataMode: input.dataMode,
    depth: input.depth ?? "full",
    generatedAt: now.toISOString(),
    activity: {
      status,
      lastDealDate: last?.date ?? null,
      lastLeadDate: lastLead?.date ?? null,
      monthsSinceLastDeal,
      dealsLast12m: last12.length,
      leadsLast12m: last12.filter((r) => myRole(r, inv).isLead === true).length,
      quarterly,
      roundIds: (last12.length ? last12 : dated.slice(0, 5)).map((r) => r.id),
    },
    leadership: {
      leadRate,
      leads,
      knownRoles,
      deals: mine.length,
      roundIds: (ledRounds.length ? ledRounds : mine).slice(0, 25).map((r) => r.id),
    },
    followOn: {
      rate: followCompanies.length ? followed / followCompanies.length : null,
      followed,
      eligible: followCompanies.length,
      companies: followCompanies,
    },
    graduation: {
      rate: gradCompanies.length ? graduated / gradCompanies.length : null,
      graduated,
      eligible: gradCompanies.length,
      companies: gradCompanies,
    },
    fit: {
      stages: stageDist,
      sectors: sectorDist.slice(0, 6),
      countries: countryDist.slice(0, 6),
      medianRoundEur,
      typicalStage,
    },
    coInvestors,
    conflicts: conflicts.slice(0, 5),
    talkingPoints: talkingPoints.slice(0, 5),
    fitScore,
    rounds: roundsById,
    companies: pickCompanies(input.companies, roundsById),
    warnings,
    trace: input.trace,
  };
}

function dedupe(rounds: Round[]): Round[] {
  const seen = new Map<string, Round>();
  for (const r of rounds) {
    const key = r.id || `${r.companyId}|${r.date}|${r.stage}`;
    const prev = seen.get(key);
    if (!prev) seen.set(key, r);
    else if (r.investors.length > prev.investors.length) seen.set(key, { ...r, sources: mergeSources(prev, r) });
  }
  return [...seen.values()];
}

function mergeSources(a: Round, b: Round) {
  const urls = new Set<string>();
  return [...a.sources, ...b.sources].filter((s) => {
    const k = s.url ?? s.name;
    if (urls.has(k)) return false;
    urls.add(k);
    return true;
  });
}

function pickCompanies(all: Record<string, Company>, rounds: Record<string, Round>): Record<string, Company> {
  const out: Record<string, Company> = {};
  for (const r of Object.values(rounds)) {
    const c = all[r.companyId];
    if (c) out[c.id] = c;
  }
  return out;
}
