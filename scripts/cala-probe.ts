// Probe Cala and print the raw shapes, so you can tune lib/cala/queries.ts and lib/cala/parse.ts.
//
//   npm run probe -- "Lifeline Ventures"
//   npm run probe -- "Lifeline Ventures" --query "funding_rounds.investors=Lifeline Ventures.limit=5"
//
// Full JSON responses are saved to .kyi-cache/probe/.

import { mkdirSync, writeFileSync } from "node:fs";
import { CALA_QUERIES } from "../lib/cala/queries";

const BASE = process.env.CALA_API_BASE || "https://api.cala.ai";
const KEY = process.env.CALA_API_KEY;
if (!KEY) {
  console.error("CALA_API_KEY missing. Put it in .env.local (see .env.example).");
  process.exit(1);
}

const args = process.argv.slice(2);
const qIdx = args.indexOf("--query");
const customQuery = qIdx >= 0 ? args[qIdx + 1] : null;
const name = args.filter((_, i) => i !== qIdx && i !== qIdx + 1)[0] ?? "Lifeline Ventures";
const OUT = ".kyi-cache/probe";
mkdirSync(OUT, { recursive: true });

async function call(method: "GET" | "POST", path: string, body?: unknown) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "X-API-KEY": KEY!, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    // keep text
  }
  console.log(`\n=== ${method} ${path} → HTTP ${res.status} in ${Date.now() - t0} ms`);
  return { status: res.status, json };
}

function save(file: string, data: unknown) {
  writeFileSync(`${OUT}/${file}`, JSON.stringify(data, null, 2));
  console.log(`(saved ${OUT}/${file})`);
}

function show(data: unknown, max = 1800) {
  const s = JSON.stringify(data, null, 2);
  console.log(s.length > max ? `${s.slice(0, max)}\n… (${s.length} chars)` : s);
}

(async () => {
  // 1. Resolve the investor
  const search = await call("GET", `/v1/entities?${new URLSearchParams({ name, limit: "5" })}`);
  save("1-entity-search.json", search.json);
  show(search.json, 1200);
  const top = (search.json as { entities?: { id: string; name: string }[] })?.entities?.[0];

  // 2. What does the graph know about it?
  if (top) {
    const intro = await call("GET", `/v1/entities/${top.id}/introspection`);
    save("2-introspection.json", intro.json);
    const j = intro.json as { properties?: string[]; relationships?: unknown };
    show({ properties: j?.properties, relationships: j?.relationships }, 2500);
  }

  // 3. The structured query KYI uses for the report card
  const input = customQuery ?? CALA_QUERIES.investorRounds(name);
  console.log(`\nQuery: ${input}`);
  const q = await call("POST", "/v1/knowledge/query", { input, return_entities: true });
  save("3-investor-rounds.json", q.json);
  const rows = (q.json as { results?: Record<string, unknown>[] })?.results ?? [];
  console.log(`rows: ${rows.length}`);
  console.log(`keys in first row: ${rows[0] ? Object.keys(rows[0]).join(", ") : "-"}`);
  show(rows.slice(0, 3), 3000);

  // 4. Company rounds for the first company found
  const firstCompany = rows.map((r) => r.company ?? r.company_name ?? r.name).find((x) => typeof x === "string") as string | undefined;
  if (firstCompany && !customQuery) {
    const cq = CALA_QUERIES.companyRounds(firstCompany);
    console.log(`\nQuery: ${cq}`);
    const c = await call("POST", "/v1/knowledge/query", { input: cq, return_entities: true });
    save("4-company-rounds.json", c.json);
    const crow = (c.json as { results?: Record<string, unknown>[] })?.results ?? [];
    console.log(`rows: ${crow.length}`);
    show(crow.slice(0, 4), 2000);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
