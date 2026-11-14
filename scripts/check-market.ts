/**
 * Assert demo market radar matches PRODUCT.md expectations for Mikko's thesis.
 * Run: npx tsx scripts/check-market.ts
 */
import { buildMarketReport } from "../lib/market";
import { DemoProvider } from "../lib/providers/demo";
import { newCtx } from "../lib/provider";
import type { Thesis } from "../lib/types";

const thesis: Thesis = {
  sectors: ["logistics", "mobility"],
  stages: ["pre-seed", "seed"],
  regions: ["Nordics", "Baltics"],
  ticketMinEur: 500_000,
  ticketMaxEur: 3_000_000,
};

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

async function main() {
  const provider = new DemoProvider();
  const ctx = newCtx();
  const { rounds, companies } = await provider.getSectorRounds(thesis, ctx);
  if (rounds.length < 10) fail(`expected a rich sector sample, got ${rounds.length} rounds`);

  const report = buildMarketReport(rounds, companies, thesis, new Date(), {
    dataMode: "demo",
    trace: { queries: ctx.queries, calls: ctx.calls, cacheHits: ctx.cacheHits, ms: 0 },
  });

  if (report.kpis.deals12m < 1) fail("kpis.deals12m should be > 0");
  if (report.kpis.medianRoundEur == null) fail("kpis.medianRoundEur missing");
  if (!report.quarterly.length) fail("quarterly empty");
  if (!report.recentRounds.length) fail("recentRounds empty");

  const sisu = report.topLeads.find((l) => /sisu/i.test(l.name));
  if (!sisu) fail(`Sisu Seed Partners not in topLeads: ${report.topLeads.map((l) => l.name).join(", ")}`);
  if (sisu.leads < 1) fail("Sisu should have ≥1 lead in sample");

  const lumipolku = report.toWatch.find((w) => /lumipolku/i.test(w.company.name));
  if (!lumipolku) {
    fail(
      `Lumipolku Logistics (demo) missing from toWatch (${report.toWatch.length}): ${report.toWatch.map((w) => w.company.name).join(", ")}`,
    );
  }
  if (lumipolku.score < 20) fail(`Lumipolku score too low: ${lumipolku.score}`);
  if (!lumipolku.reasons.length) fail("Lumipolku should have reason chips");
  if (lumipolku.lastRound.stage !== "pre-seed") fail(`expected pre-seed, got ${lumipolku.lastRound.stage}`);
  if (lumipolku.monthsSince < 9 || lumipolku.monthsSince > 30) {
    fail(`Lumipolku monthsSince out of window: ${lumipolku.monthsSince}`);
  }

  console.log("OK — demo market report");
  console.log(`  sampleSize=${report.sampleSize} deals12m=${report.kpis.deals12m} trend=${report.kpis.trendPct}%`);
  console.log(`  topLeads: ${report.topLeads.slice(0, 5).map((l) => `${l.name}(${l.leads})`).join(", ")}`);
  console.log(`  Lumipolku score=${lumipolku.score} reasons=${lumipolku.reasons.map((r) => r.label).join(" · ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
