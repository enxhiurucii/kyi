# KYI — Know Your Investor · Know Your Investment
Vision: founders and investors make million-euro decisions with browser tabs and gut feeling. KYI turns Cala's
knowledge graph (sourced, connected data on companies, people, funding rounds, investors) into behaviour-based,
sourced answers for BOTH sides — one engine, two lenses.

Users
- Founder ("I'm raising"): find and check investors who actually lead rounds like mine and are still active.
- Investor ("I'm investing"): see where money flows in my field, who leads deals, and which young companies are
  likely to raise next; get a sourced background check on any company.

Information architecture
- /            landing: two big entry cards (Raise / Invest) + demo personas + "how it works" graph
- /raise       founder workspace (the current home form + shortlist), /report, /compare (existing)
- /invest      investor workspace: thesis (sectors, stages, regions, ticket) → /market (Market Radar)
- /company     company report card (background check)
- /scout       agent for both sides (?for=founder|investor)
- /watchlist   investor's saved companies; /profile role-specific profile

Shared engine (existing code — reuse, don't duplicate)
- lib/cala/client.ts (ONLY way to call Cala: paces to ~10 req/min + disk cache), lib/cala/parse.ts, lib/cala/queries.ts
- lib/providers/{cala,demo,demoWorld}.ts (DataProvider), lib/service.ts, lib/metrics.ts (investor report),
  lib/scoring.ts, lib/similarity.ts (SECTOR_KEYWORDS, inferSectors), components/ui.tsx, components/EvidenceDrawer.tsx

Principles
1. Every number links to evidence (round ids → EvidenceDrawer, or source URLs). Show data gaps as "Data notes".
2. Demo mode (fictional, deterministic, instant) must work for EVERY feature; live mode uses Cala.
3. Cala rate limit ~10 requests/minute: budget calls per request, cache everything, show progress/loading states.
4. Next.js 16: middleware is proxy.ts; Cache Components is ON → read session only in route handlers or inside
   <Suspense>; pages are thin server components rendering client components; data via /api/* routes.
5. Quality gate after every task: npx tsc --noEmit, npx eslint ., npm run build.
6. Privacy: founders' startups are visible to investors ONLY if the founder opts in ("discoverable"). Investors never
   see which founders looked them up.

Demo personas (fictional, label "demo")
- Anna — founder of "Lumipolku Logistics (demo)": "AI route planning for trucking fleets — cuts empty kilometres
  and fuel costs", Seed, Finland, existing investors Kettu Ventures + Revontuli Angels, discoverable = true.
- Mikko — partner at "Sisu Seed Partners" (demo), thesis: logistics + mobility, pre-seed/seed, Nordics + Baltics,
  ticket €0.5–3M.

Scores (transparent, shown as reason chips)
- Investor fit (existing, lib/scoring.ts): active 25 · stage 20 · sector 20 · leads 15 · invests again 10 · country 10,
  minus 30/12 for conflicts.
- Raise-soon signal for companies (new, 0–100): timing 35 (months since last round: 12–24 → 35; 9–12 or 24–30 → 20;
  else 5) · backer strength 25 (lead investor's lead count in the sector sample: ≥3 → 25, 2 → 18, 1 → 10, unknown → 8)
  · round size 15 (≥ sector median for that stage → 15, ≥ half → 8, unknown → 6) · thesis fit 25 (sector 10 +
  stage 10 + country 5).
- Thesis fit (company vs investor thesis): sector, stage, country, ticket vs last round size.

Pitch line: "Know your investor. Know your investment. Every number has a source."

## 3-minute demo script

1. **Landing (15s)** — “Know Your Investor · Know Your Investment. Every number has a source.” Point at Raise / Invest cards.
2. **Anna — founder (60s)** — Try as founder → `/raise?mode=demo`. Rank her shortlist: Sisu Seed #1 (active, leads). Open Aurora Peak: conflict with RouteMind. Evidence drawer → source. Optional: Scout Demo → top leads (Sisu / Arctic / Kettu).
3. **Mikko — investor (60s)** — Home → Try as investor → Market Radar (demo). KPIs + **Companies to watch**: Lumipolku Logistics with **On KYI · raising Seed**. Open company card → raise-soon + thesis fit.
4. **The match (30s)** — On Lumipolku, Express interest (optional note). Switch to Anna (Try as founder). `/raise` shows **Sisu Seed Partners is interested · fit …** + Mutual match.
5. **Under the hood / live (30s, if warmed)** — Switch Live · Cala → Lifeline Ventures report → Recent deals + Under the hood graph walk. “Same engine, two lenses.”
6. **Close (15s)** — Print meeting brief / company one-pager. Pitch line again.

Quality gate after changes: `npx tsc --noEmit`, `npx eslint .`, `npm run build`, plus `npm run check:market`, `check:scout`, `check:interests`.
