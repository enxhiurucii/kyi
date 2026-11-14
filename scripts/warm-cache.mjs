// Pre-load (cache) the live examples you plan to show, so the demo is instant.
// 1) start the app:   npm run dev
// 2) in another tab:  npm run warm
//
// Always warms:
//   - Lifeline Ventures full report (founder live example)
//   - Mikko's live market radar (logistics + mobility, Nordics + Baltics)
//   - 3 company cards: Wolt, Aiven, Oura
// Plus optional names from data/slush-investors.txt
//
// Cala answers are cached in .kyi-cache/ (72 h by default). With ~10 requests/minute a full report
// card takes 2–4 minutes the first time — run this the evening before your demo.
import { readFileSync } from "node:fs";

const [
  base = "http://localhost:3000",
  description = "AI route planning for trucking fleets — cuts empty kilometres and fuel costs",
  stage = "seed",
  country = "Finland",
] = process.argv.slice(2);

const startup = { description, stage, country };

const mikkoThesis = {
  sectors: ["logistics", "mobility"],
  stages: ["pre-seed", "seed"],
  regions: ["Nordics", "Baltics"],
  ticketMinEur: 500_000,
  ticketMaxEur: 3_000_000,
};

const SAMPLE_COMPANIES = ["Wolt", "Aiven", "Oura"];

let slushNames = [];
try {
  slushNames = readFileSync(new URL("../data/slush-investors.txt", import.meta.url), "utf8")
    .split("\n")
    .map((l) => l.replace(/#.*/, "").trim())
    .filter(Boolean);
} catch {
  /* optional file */
}

const investorNames = ["Lifeline Ventures", ...slushNames.filter((n) => !/^lifeline/i.test(n))];

async function warmReport(name, i, total) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/api/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ investor: name, startup, mode: "cala", depth: "full" }),
    });
    const json = await res.json();
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    if (!res.ok) console.log(`[${i}/${total}] ✗ ${name}: ${json.error} (${secs}s)`);
    else
      console.log(
        `[${i}/${total}] ✓ ${json.investor?.name ?? name}: fit ${json.fitScore?.score ?? "–"}, ${json.trace?.calls ?? "–"} calls (${secs}s)`,
      );
  } catch (e) {
    console.log(`[${i}/${total}] ✗ ${name}: ${e.message}`);
  }
}

console.log(`Warming ${investorNames.length} investors against ${base} …`);
for (const [i, name] of investorNames.entries()) {
  await warmReport(name, i + 1, investorNames.length);
}

console.log(`\nWarming market radar (Mikko thesis) …`);
{
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/api/market`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thesis: mikkoThesis, mode: "cala" }),
    });
    const json = await res.json();
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    if (!res.ok) console.log(`✗ market: ${json.error} (${secs}s)`);
    else {
      console.log(
        `✓ market: ${json.sampleSize} rounds, ${json.toWatch?.length ?? 0} to-watch, ${json.trace?.calls ?? "–"} calls (${secs}s)`,
      );
    }
  } catch (e) {
    console.log(`✗ market: ${e.message}`);
  }
}

console.log(`\nWarming company cards (${SAMPLE_COMPANIES.join(", ")}) …`);
for (const [i, name] of SAMPLE_COMPANIES.entries()) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/api/company`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: name, thesis: mikkoThesis, mode: "cala" }),
    });
    const json = await res.json();
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    if (!res.ok) console.log(`[${i + 1}/${SAMPLE_COMPANIES.length}] ✗ ${name}: ${json.error} (${secs}s)`);
    else
      console.log(
        `[${i + 1}/${SAMPLE_COMPANIES.length}] ✓ ${json.company?.name ?? name}: raiseSoon ${json.raiseSoon?.score ?? "–"} (${secs}s)`,
      );
  } catch (e) {
    console.log(`[${i + 1}/${SAMPLE_COMPANIES.length}] ✗ ${name}: ${e.message}`);
  }
}

console.log("\nDone. Live examples are cached for the demo.");
