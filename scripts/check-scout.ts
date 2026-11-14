/**
 * Assert demo Scout plans match PRODUCT expectations (founder + investor).
 * Run: npx tsx scripts/check-scout.ts
 */
import { buildDemoFounderPlan, buildDemoInvestorPlan } from "../lib/scout/demoPlan";
import { DEMO_STARTUP } from "../lib/presets";
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
  const t0 = Date.now();
  const founderPlan = await buildDemoFounderPlan(DEMO_STARTUP);
  const founderMs = Date.now() - t0;

  const names = founderPlan.items.map((i) => i.name);
  for (const need of ["Sisu Seed Partners", "Arctic Loop Capital", "Kettu Ventures"]) {
    if (!names.some((n) => n.includes(need.split(" ")[0]!))) {
      fail(`founder plan missing ${need}: ${names.join(", ")}`);
    }
  }
  if (names.some((n) => /aurora/i.test(n))) fail(`Aurora should be excluded: ${names.join(", ")}`);
  if (founderPlan.items.length < 3) fail(`founder plan too short: ${founderPlan.items.length}`);
  for (const item of founderPlan.items) {
    if (!item.why.length) fail(`${item.name}: empty why`);
    if (item.score < 0 || item.score > 100) fail(`${item.name}: bad score`);
  }
  if (founderMs > 15_000) fail(`founder demo took ${founderMs}ms (>15s)`);

  const t1 = Date.now();
  const investorPlan = await buildDemoInvestorPlan(thesis);
  const investorMs = Date.now() - t1;

  const cos = investorPlan.items.map((i) => i.name);
  if (!cos.some((n) => /lumipolku/i.test(n))) fail(`investor plan missing Lumipolku: ${cos.join(", ")}`);
  if (investorPlan.items.length < 3) fail(`investor plan too short: ${investorPlan.items.length}`);
  for (const item of investorPlan.items) {
    if (!item.why.length) fail(`${item.name}: empty why`);
  }
  if (investorMs > 15_000) fail(`investor demo took ${investorMs}ms (>15s)`);

  console.log("OK — demo scout");
  console.log(`  founder ${founderMs}ms: ${names.join(" · ")}`);
  console.log(`  investor ${investorMs}ms: ${cos.join(" · ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
