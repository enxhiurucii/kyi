import { getDemoWorld } from "../providers/demoWorld";
import { buildInvestorReport, getProvider } from "../service";
import { buildMarketReport } from "../market";
import { buildCompanyReport } from "../companyReport";
import { DemoProvider } from "../providers/demo";
import { newCtx } from "../provider";
import { parseOwnCompany } from "../profiles/parse";
import type { CompanyProfile, FounderProfile } from "../profiles/types";
import type { Startup, Thesis } from "../types";
import type { ScoutPlan } from "./schema";

const TOP_NAMES = ["Sisu Seed Partners", "Arctic Loop Capital", "Kettu Ventures", "Saimaa Seed", "Amber Coast VC"] as const;

export async function buildDemoFounderPlan(
  startup: Startup,
  founder?: FounderProfile | null,
  company?: CompanyProfile | null,
  onStep?: (icon: string, text: string) => void,
): Promise<ScoutPlan> {
  const w = getDemoWorld();
  const provider = getProvider("demo");
  const own = parseOwnCompany(company);

  onStep?.("🔎", "Searching similar logistics / fleet companies…");
  const similar = Object.values(w.companies)
    .filter((c) => /logistics|fleet|truck|route|cargo|warehouse|freight/i.test(`${c.name} ${c.description}`))
    .slice(0, 12);
  onStep?.("🏢", `Found ${similar.length} similar companies`);

  const leadCount = new Map<string, { n: number; roundIds: string[] }>();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 24);
  for (const r of w.rounds) {
    if (!r.date || new Date(r.date) < cutoff) continue;
    const co = w.companies[r.companyId];
    if (!co || !/logistics|fleet|truck|route|cargo|warehouse|freight/i.test(`${co.name} ${co.description}`)) continue;
    for (const p of r.investors) {
      if (!p.isLead) continue;
      const cur = leadCount.get(p.investorName) ?? { n: 0, roundIds: [] };
      cur.n += 1;
      cur.roundIds.push(r.id);
      leadCount.set(p.investorName, cur);
    }
  }
  onStep?.("📈", "Counting who led similar rounds (24 mo)…");

  const items: ScoutPlan["items"] = [];
  for (const name of TOP_NAMES) {
    onStep?.("🧭", `Report card: ${name}`);
    const report = await buildInvestorReport(provider, name, startup, "quick", own);
    if (!report) continue;
    if (/aurora/i.test(name)) continue;
    const leads = leadCount.get(name);
    const conflict =
      report.conflicts[0] && report.conflicts[0].similarity >= 0.28
        ? `Conflict: ${report.conflicts[0].companyName}`
        : undefined;

    const why: string[] = [];
    if (leads && leads.n > 0) why.push(`Led ${leads.n} similar logistics round${leads.n === 1 ? "" : "s"} in the last 24 months`);
    for (const r of report.fitScore?.reasons.slice(0, 3) ?? []) why.push(r.label);
    if (why.length === 0) why.push(`${report.activity.status} · ${report.activity.dealsLast12m} deals in 12 mo`);

    items.push({
      name: report.investor.name,
      id: report.investor.id,
      score: report.fitScore?.score ?? 70,
      why,
      evidenceRoundIds: (leads?.roundIds ?? report.activity.roundIds).slice(0, 4),
      risk: conflict,
      draftMessage: draftFounder(startup, report.investor.name, why[0] ?? "your recent logistics investments"),
    });
  }

  onStep?.("✅", `Plan ready · ${items.length} investors`);
  return {
    summary: `Five active funds that led similar Nordic logistics / fleet rounds — Aurora Peak excluded (RouteMind AI conflict).`,
    for: "founder",
    items,
  };
}

export async function buildDemoInvestorPlan(
  thesis: Thesis,
  onStep?: (icon: string, text: string) => void,
): Promise<ScoutPlan> {
  const provider = new DemoProvider();
  const ctx = newCtx();

  onStep?.("📡", "Building market radar for thesis…");
  const sample = await provider.getSectorRounds(thesis, ctx);
  const market = buildMarketReport(sample.rounds, sample.companies, thesis, new Date(), {
    dataMode: "demo",
    trace: { queries: [], calls: 1, cacheHits: 0, ms: 0 },
  });
  onStep?.("📡", `${market.sampleSize} rounds · ${market.toWatch.length} companies to watch`);

  const candidates = market.toWatch.slice(0, 8);
  // Ensure Lumipolku is included
  const hasLumi = candidates.some((c) => /lumipolku/i.test(c.company.name));
  if (!hasLumi) {
    const lumi = market.toWatch.find((c) => /lumipolku/i.test(c.company.name));
    if (lumi) candidates.unshift(lumi);
  }

  const items: ScoutPlan["items"] = [];
  for (const row of candidates.slice(0, 6)) {
    onStep?.("🧭", `Company card: ${row.company.name}`);
    const profile = await provider.getCompanyProfile(row.company.id, ctx);
    if (!profile) continue;
    const report = buildCompanyReport(profile, {
      thesis,
      sampleRounds: sample.rounds,
      similarCandidates: Object.values(sample.companies),
      dataMode: "demo",
    });
    const score = report.raiseSoon?.score ?? row.score;
    const why = [
      ...(report.raiseSoon?.reasons.slice(0, 3).map((r) => r.label) ?? row.reasons.slice(0, 3).map((r) => r.label)),
      ...(report.thesisFit?.reasons.slice(0, 2).map((r) => r.label) ?? []),
    ];
    if (why.length === 0) why.push(`Raise-soon ${score}`);

    items.push({
      name: report.company.name,
      id: report.company.id,
      score,
      why,
      evidenceRoundIds: report.rounds.slice(0, 3).map((r) => r.id),
      risk: report.warnings[0],
      draftMessage: draftInvestor(report.company.name, why[0] ?? "your last round"),
    });
    if (items.length >= 5) break;
  }

  // Force Lumipolku into top 5 if missing
  if (!items.some((i) => /lumipolku/i.test(i.name))) {
    const lumi = market.toWatch.find((c) => /lumipolku/i.test(c.company.name));
    if (lumi) {
      items[Math.min(4, items.length)] = {
        name: lumi.company.name,
        id: lumi.company.id,
        score: lumi.score,
        why: lumi.reasons.map((r) => r.label).slice(0, 4),
        evidenceRoundIds: [lumi.lastRound.id],
        draftMessage: draftInvestor(lumi.company.name, lumi.reasons[0]?.label ?? "your raise timing"),
      };
    }
  }

  onStep?.("✅", `Plan ready · ${items.length} companies`);
  return {
    summary: `Five early-stage companies matching ${thesis.sectors.join(" + ")} in ${thesis.regions.join(", ")} — including Lumipolku Logistics (demo).`,
    for: "investor",
    items: items.slice(0, 5),
  };
}

function draftFounder(startup: Startup, fund: string, hook: string): string {
  return `Hi ${fund} team — we're raising ${startup.stage} for ${startup.description.slice(0, 120)}. I noticed ${hook.toLowerCase()}. Would love 20 minutes to share how we fit your thesis. Happy to send a short deck. — Founder`;
}

function draftInvestor(company: string, hook: string): string {
  return `Hi ${company} team — I invest in this space and noticed ${hook.toLowerCase()}. Would love a short intro on what you're building next and whether you're raising. Happy to share how we can help. — Investor`;
}

export async function streamDemoScout(
  send: (obj: unknown) => void,
  mode: "founder" | "investor",
  opts: {
    startup?: Startup | null;
    thesis?: Thesis | null;
    founder?: FounderProfile | null;
    company?: CompanyProfile | null;
  },
): Promise<void> {
  const steps: { icon: string; text: string }[] = [];
  const plan =
    mode === "investor"
      ? await buildDemoInvestorPlan(
          opts.thesis ?? {
            sectors: ["logistics", "mobility"],
            stages: ["pre-seed", "seed"],
            regions: ["Nordics", "Baltics"],
            ticketMinEur: 500_000,
            ticketMaxEur: 3_000_000,
          },
          (icon, text) => steps.push({ icon, text }),
        )
      : await buildDemoFounderPlan(
          opts.startup ?? {
            description: "AI route planning for trucking fleets",
            stage: "seed",
            country: "Finland",
          },
          opts.founder,
          opts.company,
          (icon, text) => steps.push({ icon, text }),
        );

  for (const s of steps) {
    send({ type: "step", icon: s.icon, text: s.text });
    await new Promise((r) => setTimeout(r, 60));
  }
  send({ type: "plan", plan });
  send({ type: "done" });
}
