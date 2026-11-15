# KYI — Know Your Investor · Know Your Investment

> Know your investor. Know your investment. Every number has a source.

KYI turns **Cala's knowledge graph** into behaviour-based, sourced answers for **both sides** of fundraising — one engine, two lenses.

| Side | What you get |
|---|---|
| **Founder** (“I'm raising”) | Ranked shortlist, fit scores, conflict alerts, sourced investor report cards, optional AI Scout |
| **Investor** (“I'm investing”) | Thesis → Market Radar, raise-soon companies, company background checks, watchlist, Express interest |

Built for **Junction 2026 · Cala challenge**.

```
  Cala knowledge graph
        │
        ▼
  Shared engine (providers → metrics / market / scoring)
        │
   ┌────┴────┐
   ▼         ▼
 Founder    Investor
 lens       lens
 (/raise)   (/invest → /market → /company)
```

---

## Quick start

```bash
npm install
cp .env.example .env.local   # all keys optional
npm run dev
```

Open http://localhost:3000.

- **Try as founder (Anna)** / **Try as investor (Mikko)** — demo mode, works offline, no keys required.
- Add `CALA_API_KEY` for Live mode. Add `ANTHROPIC_API_KEY` for Scout. Add Supabase vars for accounts.

## Demo personas (fictional)

| Persona | Role | Hook |
|---|---|---|
| **Anna** | Founder, Lumipolku Logistics (demo) | Seed · Finland · discoverable · existing: Kettu + Revontuli |
| **Mikko** | Partner, Sisu Seed Partners (demo) | Thesis: logistics + mobility · pre-seed/seed · Nordics + Baltics · €0.5–3M |

## Commands

| Command | What |
|---|---|
| `npm run dev` | Next.js app |
| `npm run build` | Production build |
| `npm run lint` / `npx tsc --noEmit` | Quality checks |
| `npm run warm` | Pre-cache live examples (app must be running): Lifeline report, Mikko market radar, Wolt/Aiven/Oura |
| `npm run probe -- "Name"` | Inspect raw Cala responses |
| `npm run check:market` | Demo Market Radar expectations |
| `npm run check:scout` | Demo Scout top-5 expectations |
| `npm run check:interests` | Demo Express interest / mutual match |

## Screens

- `/` — landing (Raise / Invest + demo personas)
- `/raise` — founder workspace (shortlist + inbound interests)
- `/report`, `/compare` — investor report card & side-by-side
- `/invest` → `/market` — thesis & Market Radar
- `/company` — company background check
- `/scout?for=founder|investor` — AI agent (needs Anthropic for Live; Demo works without)
- `/watchlist`, `/profile` — investor saves & profiles

## Environment (all optional except for live data)

| Variable | Needed for |
|---|---|
| `CALA_API_KEY` | Live reports, market, company cards |
| `ANTHROPIC_API_KEY` | Live Scout agent |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sign-in, cloud profiles, Express interest sync |
| `CALA_RPM` / `KYI_CACHE_*` | Rate limit & disk cache (see `.env.example`) |

Without keys, features **hide** or fall back to **Demo** — nothing crashes.

## Deploy on Railway (GitHub)

1. Push this repo to GitHub (already: `enxhiurucii/kyi`).
2. [Railway](https://railway.app) → **New Project** → **Deploy from GitHub repo** → pick `kyi`.
3. Railway auto-detects Next.js via `railway.toml` (`npm run build` / `npm run start`).
4. Open the service → **Variables** → add the keys below (at least `CALA_API_KEY` for Live mode).
5. **Settings → Networking → Generate Domain** (or attach a custom domain).
6. If you use Supabase auth: in the Supabase dashboard add  
   `https://YOUR-RAILWAY-DOMAIN/auth/callback`  
   under Authentication → URL configuration (Redirect URLs), and set Site URL to your Railway domain.
7. Redeploy after changing env vars. Check `/api/health` — `calaConfigured` / `aiEnabled` should match what you set.

**Note:** Cala responses cache to disk (`.kyi-cache/`). On Railway that disk is ephemeral (cleared on redeploy). Fine for a hackathon; add a Railway Volume mounted at `/app/.kyi-cache` if you want the cache to survive restarts.

### Rate limit & warm

Cala hackathon keys ≈ **10 req/min**. First full report ≈ **2–4 min**, then cached in `.kyi-cache/`.

```bash
npm run dev          # terminal 1
npm run warm         # terminal 2 — evening before the live demo
```

## Architecture

| Layer | Role |
|---|---|
| `lib/cala/client.ts` | Only Cala entry: pacing, retries, disk cache |
| `lib/providers/{cala,demo}.ts` | DataProvider for live vs synthetic world |
| `lib/metrics.ts` / `lib/market.ts` / `lib/scoring.ts` | Investor reports, Market Radar, fit / raise-soon |
| `app/api/*` | Thin route handlers; UI is client components |
| `components/*` | Raise / Invest / Scout / report / evidence |

**Principles:** every number links to evidence; demo works for every feature; Cache Components on (session only in routes / Suspense); founders are discoverable only with opt-in.

## 3-minute demo script

See [docs/PRODUCT.md](docs/PRODUCT.md) — Anna → shortlist → Mikko Market Radar (Lumipolku) → Express interest → match → Live Lifeline under the hood.

## Video

Optional Remotion demo in `video/` — update VO in `video/voiceover/scenes.json`, then `npm run capture` / `voice` / `render` from that folder.
