/**
 * Assert demo Express-interest mutual match: Mikko → Lumipolku → Anna sees Sisu with fit.
 * Run: npx tsx scripts/check-interests.ts
 */
import { demoMikkoLumipolkuScores, enrichIncomingDemo, mutualMatch } from "../lib/interests/enrich";
import {
  DEMO_ANNA_COMPANY_ID,
  DEMO_LUMIPOLKU_NAME,
  DEMO_MIKKO_ID,
  DEMO_SISU_FIRM,
  type InterestRecord,
} from "../lib/interests/types";
import type { CompanyProfile } from "../lib/profiles/types";

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

async function main() {
  const scores = await demoMikkoLumipolkuScores();
  if (scores.fit < 70) fail(`investor fit too low for mutual: ${scores.fit}`);
  if (scores.thesisFit < 70) fail(`thesis fit too low for mutual: ${scores.thesisFit}`);
  if (!scores.mutual) fail("expected mutual match for Mikko ↔ Lumipolku");

  const interest: InterestRecord = {
    id: "test-1",
    companyId: DEMO_ANNA_COMPANY_ID,
    companyName: DEMO_LUMIPOLKU_NAME,
    companyStage: "seed",
    investorUserId: DEMO_MIKKO_ID,
    investorName: "Mikko",
    investorFirm: DEMO_SISU_FIRM,
    message: "Love the empty-km thesis.",
    createdAt: new Date().toISOString(),
    source: "demo",
  };

  const company: CompanyProfile = {
    name: DEMO_LUMIPOLKU_NAME,
    oneLiner: "AI route planning for trucking fleets — cuts empty kilometres and fuel costs",
    stage: "seed",
    country: "Finland",
    sectors: ["logistics"],
    existingInvestors: [{ name: "Kettu Ventures" }],
    discoverable: true,
    updatedAt: new Date().toISOString(),
  };

  const enriched = await enrichIncomingDemo([interest], company);
  if (enriched.length !== 1) fail("expected 1 enriched interest");
  const row = enriched[0]!;
  if (!/sisu/i.test(row.investorFirm)) fail(`expected Sisu, got ${row.investorFirm}`);
  if (row.fitScore == null || row.fitScore < 70) fail(`fit score missing/low: ${row.fitScore}`);
  if (!row.mutualMatch) fail("enriched row should be mutual match");
  if (!row.reportHref.includes("inv=")) fail("report href missing");
  if (!mutualMatch(row.fitScore, row.thesisFitScore)) fail("mutualMatch helper disagree");

  // Privacy: non-discoverable companies must not appear in founder inbound UI (enforced by component + API).
  if (company.discoverable !== true) fail("demo Anna must be discoverable");

  console.log("OK — demo interests");
  console.log(`  ${DEMO_SISU_FIRM} → ${DEMO_LUMIPOLKU_NAME}`);
  console.log(`  fit=${row.fitScore} thesisFit=${row.thesisFitScore} mutual=${row.mutualMatch}`);
  console.log(`  copy: "${row.investorFirm} is interested · fit ${Math.round(row.fitScore!)}"`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
