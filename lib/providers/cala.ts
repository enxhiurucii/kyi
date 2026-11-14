// Live data from the Cala knowledge graph — graph-first and call-efficient.
//
// Cala's graph (verified with the live API):
//   Investor ──PARTICIPATES_IN_FUNDING_ROUND {role: INVESTOR, is_lead?, sources}──▶ FundingRound
//   Company  ──PARTICIPATES_IN_FUNDING_ROUND {role: ISSUER, sources}──────────────▶ FundingRound
//   FundingRound: round_label, announcement_date, transaction_value(+_units) — every value sourced
//   Company: description, headquarters_address ──OPERATES_IN_INDUSTRY──▶ Industry
//
// Calls per report card (cached on disk, see lib/cache.ts):
//   quick : entity_search + 1 investor read                       → activity, lead rate, stage mix
//   full  : + up to KYI_MAX_ROUND_DETAILS round reads             → companies, co-investors, amounts
//           + 1 read per portfolio company (description, industry, ALL its rounds)
//             → conflicts, follow-on (is our investor on a later round?), graduation (did it raise again?)
// If the graph has nothing for an investor we fall back to a structured knowledge_query (slow: 30–100 s).

import { mapLimit } from "../cache";
import { cala, type CalaEntity, type CalaQueryResponse, type CalaRelated, type CalaRetrieved } from "../cala/client";
import {
  countryFromAddress,
  eurFrom,
  hostOf,
  moneyLabel,
  parseDate,
  parseRoundRow,
  parseSources,
  parseStage,
  prettyRoundLabel,
  propValue,
  sourcesFromProperties,
} from "../cala/parse";
import { CALA_QUERIES, SECTOR_CALA_TERM } from "../cala/queries";
import { normName } from "../format";
import type { CompanyRef, Ctx, DataProvider, InvestorRoundsResult } from "../provider";
import { ProviderError } from "../provider";
import { inferSectors, normalizeSector } from "../similarity";
import type { Company, CompanyProfileResult, Investor, Participation, Round, SourceRef, Thesis, ThesisRegion } from "../types";

const REL_ROUND = "PARTICIPATES_IN_FUNDING_ROUND";
const ROUND_PROPS = ["name", "round_label", "announcement_date", "transaction_value", "transaction_value_units", "instrument"];
const COMPANY_PROPS = ["name", "description", "headquarters_address", "funding_stage", "operational_status"];

export const MAX_ROUND_DETAILS = Number(process.env.KYI_MAX_ROUND_DETAILS || 15);
const CONC = Number(process.env.CALA_GRAPH_CONCURRENCY || 3);

const INVESTOR_TYPES = new Set([
  "Company",
  "Organization",
  "Person",
  "Group",
  "NonprofitOrganization",
  "GovernmentalInstitution",
  "EducationalInstitution",
  "ResearchInstitution",
]);
const COMPANY_TYPES = new Set(["Company", "Organization"]);
const INVESTOR_WORDS = /invest|venture|capital|fund|angel|portfolio|accelerator|private equity|\bvc\b/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function investorScore(e: CalaEntity, q: string): number {
  const n = normName(e.name);
  const qq = normName(q);
  let s = 0;
  if (n === qq) s += 3;
  else if (n.includes(qq) || qq.includes(n)) s += 1;
  if (INVESTOR_TYPES.has(e.entity_type)) s += 1;
  if (e.description && INVESTOR_WORDS.test(e.description)) s += 2;
  if (INVESTOR_WORDS.test(e.name)) s += 0.5;
  return s;
}

function toInvestor(e: { id: string; name: string; entity_type: string; description?: string | null }): Investor {
  return { id: e.id, entityId: e.id, name: e.name, description: e.description ?? undefined, kind: e.entity_type };
}

function toCompany(e: { id: string; name: string; description?: string | null }): Company {
  const description = (e.description ?? "").trim();
  return { id: e.id, entityId: e.id, name: e.name, description, sectors: inferSectors(description).slice(0, 3), country: null };
}

function companyScore(e: CalaEntity, q: string): number {
  const n = normName(e.name);
  const qq = normName(q);
  let s = 0;
  if (n === qq) s += 4;
  else if (n.includes(qq) || qq.includes(n)) s += 1.5;
  if (e.entity_type === "Company") s += 2;
  else if (COMPANY_TYPES.has(e.entity_type)) s += 1;
  if (e.description) s += 0.5;
  if (INVESTOR_WORDS.test(e.name) || (e.description && INVESTOR_WORDS.test(e.description))) s -= 2;
  return s;
}

function toBool(v: unknown): boolean | null {
  if (v === true || v === "true" || v === "TRUE") return true;
  if (v === false || v === "false" || v === "FALSE") return false;
  return null;
}

// Portfolio / profile pages carry the date they were crawled, not the date of the deal.
const HOMEPAGE = /^https?:\/\/[^/]+\/?(?:[?#].*)?$/i;
const LISTING_PAGE =
  /\/(companies|portfolio|startups|investments|organization|organisations?)(\/[^/?#]*)?\/?(?:[?#].*)?$|tracxn\.com\/d\/|crunchbase\.com\/organization|pitchbook\.com\/profiles|dealroom\.co\/companies|linkedin\.com\/company/i;

/** Earliest dated news/press source on an edge ≈ when the round was announced (null if only listing pages). */
function edgeDate(e: CalaRelated): string | null {
  const dates = parseSources(e.properties?.sources ?? null)
    .filter((s) => !(s.url && (LISTING_PAGE.test(s.url) || HOMEPAGE.test(s.url))))
    .map((s) => (s.date ? parseDate(s.date) : null))
    .filter((d): d is string => !!d)
    .sort();
  return dates[0] ?? null;
}

/** Cala marks leads explicitly (is_lead: true) and leaves the flag out otherwise. */
function applyLeadConvention(parts: Participation[]): Participation[] {
  if (!parts.some((p) => p.isLead === true)) return parts;
  return parts.map((p) => (p.isLead === null ? { ...p, isLead: false } : p));
}

function rethrowFatal(e: unknown) {
  if (e instanceof ProviderError && (e.code === "auth" || e.code === "missing_key" || e.code === "rate_limited")) throw e;
}

function usableRows(resp: CalaQueryResponse | null): Record<string, unknown>[] {
  if (!resp || !Array.isArray(resp.results)) return [];
  return resp.results.filter((r) => r && typeof r === "object" && !("error" in r));
}

function roundEdges(ent: CalaRetrieved, role: "INVESTOR" | "ISSUER"): CalaRelated[] {
  return (ent.relationships?.outgoing?.[REL_ROUND] ?? []).filter((e) => /round/i.test(e.entity_type) && (e.properties?.role ?? role) === role);
}

export class CalaProvider implements DataProvider {
  readonly mode = "cala" as const;

  // ---------- Graph reads (identical bodies → shared cache entries) ----------

  private investorEntity(id: string, ctx: Ctx) {
    return cala.retrieve(
      id,
      { properties: ["name", "description", "website"], relationships: { outgoing: { [REL_ROUND]: { limit: 300, offset: 0 } } } },
      ctx,
      `POST /v1/entities/{investor}  → ${REL_ROUND} (role, is_lead, sources)`,
    );
  }

  /** Public so market / company-report flows can reuse the same cached graph read. */
  companyEntity(id: string, ctx: Ctx) {
    return cala.retrieve(
      id,
      {
        properties: COMPANY_PROPS,
        relationships: { outgoing: { OPERATES_IN_INDUSTRY: { limit: 4, offset: 0 }, [REL_ROUND]: { limit: 40, offset: 0 } } },
      },
      ctx,
      `POST /v1/entities/{company}  → description, headquarters_address, OPERATES_IN_INDUSTRY, ${REL_ROUND} (its rounds)`,
    );
  }

  private companyEntityWithPeople(id: string, ctx: Ctx) {
    return cala.retrieve(
      id,
      {
        properties: COMPANY_PROPS,
        relationships: {
          outgoing: { OPERATES_IN_INDUSTRY: { limit: 4, offset: 0 }, [REL_ROUND]: { limit: 40, offset: 0 } },
          incoming: {
            FOUNDED: { limit: 8, offset: 0 },
            IS_CEO_OF: { limit: 4, offset: 0 },
            IS_FOUNDER_OF: { limit: 8, offset: 0 },
          },
        },
      },
      ctx,
      `POST /v1/entities/{company}  → rounds + FOUNDED / IS_CEO_OF`,
    );
  }

  private roundEntity(id: string, ctx: Ctx) {
    return cala.retrieve(
      id,
      { properties: ROUND_PROPS, relationships: { incoming: { [REL_ROUND]: { limit: 60, offset: 0 } } } },
      ctx,
      `POST /v1/entities/{round}  ← ${REL_ROUND} (issuer, investors, is_lead) + round_label, announcement_date, transaction_value`,
    );
  }

  // ---------- Investor lookup ----------

  async searchInvestors(q: string, ctx: Ctx): Promise<Investor[]> {
    if (q.trim().length < 2) return [];
    const res = await cala.searchEntities(q.trim(), 10, ctx);
    return (res.entities ?? [])
      .filter((e) => INVESTOR_TYPES.has(e.entity_type))
      .sort((a, b) => investorScore(b, q) - investorScore(a, q))
      .slice(0, 8)
      .map(toInvestor);
  }

  async resolveInvestor(q: string, ctx: Ctx): Promise<Investor | null> {
    const query = q.trim();
    if (!query) return null;
    if (UUID.test(query)) {
      // Same body as the rounds read → this single call is reused by getInvestorRounds
      const e = await this.investorEntity(query, ctx);
      return toInvestor({ ...e, description: e.description ?? (propValue(e.properties, "description") as string | null) });
    }
    const res = await cala.searchEntities(query, 8, ctx);
    const best = [...(res.entities ?? [])].sort((a, b) => investorScore(b, query) - investorScore(a, query))[0];
    if (!best || investorScore(best, query) < 1) return null;
    return toInvestor(best);
  }

  async searchCompanies(q: string, ctx: Ctx): Promise<Company[]> {
    if (q.trim().length < 2) return [];
    const res = await cala.searchEntities(q.trim(), 10, ctx);
    return (res.entities ?? [])
      .filter((e) => COMPANY_TYPES.has(e.entity_type))
      .sort((a, b) => companyScore(b, q) - companyScore(a, q))
      .slice(0, 8)
      .map(toCompany);
  }

  async resolveCompany(q: string, ctx: Ctx): Promise<Company | null> {
    const query = q.trim();
    if (!query) return null;
    if (UUID.test(query)) {
      const e = await this.companyEntity(query, ctx);
      const description = (e.description ?? (propValue(e.properties, "description") as string | null) ?? "").trim();
      return {
        id: e.id,
        entityId: e.id,
        name: e.name,
        description,
        sectors: inferSectors(description).slice(0, 3),
        country: countryFromAddress(propValue(e.properties, "headquarters_address") as string | null),
      };
    }
    const res = await cala.searchEntities(query, 8, ctx);
    const best = [...(res.entities ?? [])].sort((a, b) => companyScore(b, query) - companyScore(a, query))[0];
    if (!best || companyScore(best, query) < 1) return null;
    return toCompany(best);
  }

  // ---------- Rounds ----------

  /** Public helper for company profiles / market confirmations (cached). */
  async roundDetail(roundId: string, ctx: Ctx): Promise<{ round: Round; company: Company } | null> {
    const r = await this.roundEntity(roundId, ctx);
    const parts = r.relationships?.incoming?.[REL_ROUND] ?? [];
    const issuer = parts.find((p) => p.properties?.role === "ISSUER");
    if (!issuer) return null;
    const investors: Participation[] = applyLeadConvention(
      parts.filter((p) => p.properties?.role !== "ISSUER").map((p) => ({ investorId: p.id, investorName: p.name, isLead: toBool(p.properties?.is_lead) })),
    );
    const props = r.properties ?? {};
    const rawLabel = (propValue(props, "round_label") as string | null) ?? (propValue(props, "name") as string | null) ?? r.name;
    const value = Number(propValue(props, "transaction_value"));
    const units = propValue(props, "transaction_value_units") as string | null;
    const hasValue = Number.isFinite(value) && value > 0;
    return {
      round: {
        id: r.id,
        entityId: r.id,
        companyId: issuer.id,
        companyName: issuer.name,
        date: parseDate(propValue(props, "announcement_date")),
        stage: parseStage(rawLabel),
        stageLabel: prettyRoundLabel(rawLabel) || "Round",
        amountEur: hasValue ? eurFrom(value, units) : null,
        amountLabel: hasValue ? moneyLabel(value, units) : null,
        investors,
        sources: sourcesFromProperties(props as Record<string, { sources?: unknown }>),
      },
      company: { id: issuer.id, entityId: issuer.id, name: issuer.name, description: "", sectors: [], country: null },
    };
  }

  /** A round known only from an edge (no extra call): label, lead flag, sources, estimated date. */
  private edgeRound(e: CalaRelated, company: { id: string; name: string }, investors: Participation[]): Round {
    return {
      id: e.id,
      entityId: e.id,
      companyId: company.id,
      companyName: company.name,
      date: edgeDate(e),
      stage: parseStage(e.name),
      stageLabel: prettyRoundLabel(e.name) || "Round",
      amountEur: null,
      amountLabel: null,
      investors,
      sources: parseSources(e.properties?.sources ?? null),
    };
  }

  async getInvestorRounds(inv: Investor, ctx: Ctx, opts?: { detail?: number }): Promise<InvestorRoundsResult> {
    if (inv.entityId) {
      const graph = await this.investorRoundsFromGraph(inv, ctx, opts?.detail ?? MAX_ROUND_DETAILS);
      if (graph.rounds.length > 0) return graph;
    }
    if ((opts?.detail ?? MAX_ROUND_DETAILS) === 0) return { rounds: [], companies: {} }; // quick mode: never run the slow query
    return this.investorRoundsFromQuery(inv, ctx);
  }

  private async investorRoundsFromGraph(inv: Investor, ctx: Ctx, detail: number): Promise<InvestorRoundsResult> {
    const ent = await this.investorEntity(inv.entityId!, ctx);
    const edges = roundEdges(ent, "INVESTOR").sort((a, b) => (edgeDate(b) ?? "").localeCompare(edgeDate(a) ?? ""));

    // Every round from the edge alone (cheap): enough for activity, lead rate and stage mix.
    // If this investor has explicit lead flags, an unflagged round means "participated".
    const flagsLeads = edges.some((e) => toBool(e.properties?.is_lead) === true);
    const me = (e: CalaRelated): Participation => ({
      investorId: inv.id,
      investorName: inv.name,
      isLead: toBool(e.properties?.is_lead) ?? (flagsLeads ? false : null),
    });
    const rounds = new Map<string, Round>(edges.map((e) => [e.id, this.edgeRound(e, { id: "", name: "" }, [me(e)])]));
    const companies: Record<string, Company> = {};

    // Rounds read in detail (company, co-investors, amount, exact date). Half the budget goes to the most
    // recent rounds (activity, conflicts), half to 1–7-year-old rounds, which are old enough to show
    // whether the company raised again and whether the investor came back.
    const budget = Math.max(0, detail);
    const recentN = Math.min(edges.length, Math.ceil(budget / 2));
    const now = Date.now();
    const ageMonths = (d: string | null) => (d ? (now - new Date(`${d}T00:00:00Z`).getTime()) / (30.4375 * 864e5) : -1);
    const olderPool = edges.slice(recentN).filter((e) => {
      const a = ageMonths(edgeDate(e));
      return a >= 12 && a <= 84;
    });
    const olderN = Math.min(budget - recentN, olderPool.length);
    const step = olderPool.length / Math.max(1, olderN);
    const toDetail = [...edges.slice(0, recentN), ...Array.from({ length: olderN }, (_, i) => olderPool[Math.floor(i * step)])];
    const details = await mapLimit(toDetail, CONC, async (e) => {
      try {
        return await this.roundDetail(e.id, ctx);
      } catch (err) {
        rethrowFatal(err);
        return null;
      }
    });
    details.forEach((d, i) => {
      if (!d) return;
      const edge = toDetail[i];
      const listed = d.round.investors.find((p) => p.investorId === inv.entityId || normName(p.investorName) === normName(inv.name));
      if (listed) {
        listed.investorId = inv.id;
        const own = me(edge).isLead; // the investor's own edge is the most reliable lead signal
        if (own !== null && listed.isLead !== true) listed.isLead = own;
      } else {
        d.round.investors.push(me(edge));
      }
      if (!d.round.date) d.round.date = edgeDate(edge);
      if (d.round.sources.length === 0) d.round.sources = parseSources(edge.properties?.sources ?? null);
      rounds.set(d.round.id, d.round);
      companies[d.company.id] ??= d.company;
    });
    return { rounds: [...rounds.values()], companies };
  }

  /** Fallback: Cala QL structured query (slower, but works for entities without graph edges). */
  private async investorRoundsFromQuery(inv: Investor, ctx: Ctx): Promise<InvestorRoundsResult> {
    let resp = await cala.query(CALA_QUERIES.investorRounds(inv.name), ctx);
    let rows = usableRows(resp);
    if (rows.length === 0) {
      resp = await cala.query(CALA_QUERIES.investorRoundsNatural(inv.name), ctx);
      rows = usableRows(resp);
    }
    const companyEntityIds = new Map<string, string>();
    for (const e of resp?.entities ?? []) {
      if (e.entity_type === "Company" || e.entity_type === "Organization") companyEntityIds.set(normName(e.name), e.id);
    }
    const rounds: Round[] = [];
    const companies: Record<string, Company> = {};
    for (const row of rows) {
      const parsed = parseRoundRow(row, { investorHint: inv.name });
      if (!parsed) continue;
      const { round, company } = parsed;
      const listed = round.investors.find((p) => normName(p.investorName) === normName(inv.name));
      if (listed) listed.investorId = inv.id;
      else {
        const leadKnown = round.investors.some((p) => p.isLead !== null);
        round.investors.push({ investorId: inv.id, investorName: inv.name, isLead: leadKnown ? false : null });
      }
      company.entityId = companyEntityIds.get(normName(company.name));
      rounds.push(round);
      const prev = companies[company.id];
      companies[company.id] = prev
        ? { ...prev, description: prev.description || company.description, sectors: prev.sectors.length ? prev.sectors : company.sectors, country: prev.country ?? company.country }
        : company;
    }
    return { rounds, companies };
  }

  async getCompanyRounds(refs: CompanyRef[], ctx: Ctx, opts?: { detail?: number }): Promise<Record<string, Round[]>> {
    const out: Record<string, Round[]> = {};
    const detail = opts?.detail ?? 0;
    await mapLimit(refs, CONC, async (ref) => {
      try {
        if (ref.entityId) {
          // One read gives every round the company raised (label + sources + date estimate).
          // Follow-on is then "is one of the investor's own round ids among the later ones?" — no extra calls.
          const c = await this.companyEntity(ref.entityId, ctx);
          out[ref.id] = roundEdges(c, "ISSUER").map((e) => this.edgeRound(e, ref, []));
          return;
        }
        const resp = await cala.query(CALA_QUERIES.companyRounds(ref.name), ctx);
        const want = normName(ref.name);
        out[ref.id] = usableRows(resp)
          .map((row) => parseRoundRow(row, { fallbackCompany: { id: ref.id, name: ref.name } }))
          .filter((p): p is NonNullable<typeof p> => !!p)
          .filter((p) => {
            const got = normName(p.round.companyName);
            return !got || got === want || got.includes(want) || want.includes(got);
          })
          .map((p) => ({ ...p.round, companyId: ref.id, companyName: ref.name }));
      } catch (e) {
        rethrowFatal(e);
        out[ref.id] = []; // one company failing should not break the whole report
      }
    });
    if (detail > 0) {
      for (const ref of refs.slice(0, 1)) {
        const list = [...(out[ref.id] ?? [])].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
        await mapLimit(list.slice(0, detail), CONC, async (r) => {
          if (r.investors.length > 0) return;
          try {
            const d = await this.roundDetail(r.entityId ?? r.id, ctx);
            if (!d) return;
            const i = list.findIndex((x) => x.id === r.id);
            if (i >= 0) list[i] = { ...d.round, companyId: ref.id, companyName: ref.name };
          } catch (e) {
            rethrowFatal(e);
          }
        });
        out[ref.id] = list;
      }
    }
    return out;
  }

  async enrichCompanies(refs: CompanyRef[], known: Record<string, Company>, ctx: Ctx): Promise<Record<string, Company>> {
    const out = { ...known };
    const missing = refs.filter((r) => !out[r.id]?.description);
    await mapLimit(missing, CONC, async (ref) => {
      try {
        const prev = out[ref.id] ?? { id: ref.id, name: ref.name, description: "", sectors: [], country: null };
        if (ref.entityId) {
          const c = await this.companyEntity(ref.entityId, ctx); // same read as getCompanyRounds → cached
          const description = (c.description ?? (propValue(c.properties, "description") as string | null) ?? "").trim();
          const industries = (c.relationships?.outgoing?.OPERATES_IN_INDUSTRY ?? []).map((i) => i.name.replace(/_+/g, " ").toLowerCase());
          const sectors = [...new Set([...inferSectors(description), ...industries.map(normalizeSector)])].slice(0, 3);
          out[ref.id] = {
            ...prev,
            description: description || prev.description,
            sectors: prev.sectors.length ? prev.sectors : sectors,
            country: prev.country ?? countryFromAddress(propValue(c.properties, "headquarters_address") as string | null),
            entityId: ref.entityId,
          };
          return;
        }
        const res = await cala.searchEntities(ref.name, 3, ctx);
        const hit =
          (res.entities ?? []).find((e) => normName(e.name) === normName(ref.name) && e.description) ??
          (res.entities ?? []).find((e) => (e.entity_type === "Company" || e.entity_type === "Organization") && e.description);
        if (!hit?.description) return;
        out[ref.id] = {
          ...prev,
          description: hit.description,
          sectors: prev.sectors.length ? prev.sectors : inferSectors(hit.description).slice(0, 2),
          entityId: prev.entityId ?? hit.id,
        };
      } catch (e) {
        rethrowFatal(e);
      }
    });
    return out;
  }

  async getSources(round: Round, ctx: Ctx): Promise<{ answer?: string; sources: SourceRef[] }> {
    // Graph rounds already carry their provenance — no extra call needed.
    if (round.sources.length > 0) return { sources: round.sources };
    const ans = await cala.search(CALA_QUERIES.roundSources(round.companyName, round.stageLabel, round.date?.slice(0, 4)), ctx);
    const seen = new Set<string>();
    const sources: SourceRef[] = [];
    for (const c of ans.context ?? []) {
      for (const o of c.origins ?? []) {
        const url = o.document?.url || o.source?.url;
        const name = o.source?.name || o.document?.name || (url ? hostOf(url) : "Source");
        const k = url ?? name;
        if (seen.has(k)) continue;
        seen.add(k);
        sources.push({ name, url: url || undefined });
      }
    }
    return { answer: ans.content, sources: sources.slice(0, 10) };
  }

  /**
   * Market sample: ≤12 Cala calls — one QL/NL query per (sector × region group), then graph confirms for top 8 companies.
   */
  async getSectorRounds(thesis: Thesis, ctx: Ctx): Promise<{ rounds: Round[]; companies: Record<string, Company> }> {
    const BUDGET = 12;
    let spent = 0;
    const since = new Date();
    since.setUTCFullYear(since.getUTCFullYear() - 3);
    const sinceDate = since.toISOString().slice(0, 10);
    const sinceYear = since.getUTCFullYear();

    const sectors = thesis.sectors.length ? thesis.sectors : ["software"];
    const regions: ThesisRegion[] = thesis.regions.length ? thesis.regions : ["Europe"];
    const regionLabels = regions.includes("Global") ? ["Global"] : regions;

    const roundsById = new Map<string, Round>();
    const companies: Record<string, Company> = {};

    // One NL query per (sector × region group). Structured country QL is a single optional try
    // for the first Nordics country only when we still have budget (NL is what actually returns rows).
    const querySlots = Math.min(BUDGET - 2, Math.max(1, sectors.length * regionLabels.length));
    let qi = 0;
    for (const sector of sectors) {
      const term = SECTOR_CALA_TERM[sector.toLowerCase()] ?? sector;
      for (const region of regionLabels) {
        if (qi >= querySlots || spent >= BUDGET - 2) break;
        qi++;
        spent++;
        try {
          let resp = await cala.query(CALA_QUERIES.sectorRoundsNatural(term, region, sinceYear), ctx);
          let rows = usableRows(resp);
          if (rows.length === 0 && region === "Nordics" && spent < BUDGET - 2) {
            spent++;
            resp = await cala.query(CALA_QUERIES.sectorRounds(term, "Finland", sinceDate), ctx);
            rows = usableRows(resp);
          }
          for (const e of resp?.entities ?? []) {
            if (e.entity_type === "Company" || e.entity_type === "Organization") {
              const c = toCompany(e);
              companies[c.id] = { ...companies[c.id], ...c, description: companies[c.id]?.description || c.description };
            }
          }
          for (const row of rows) {
            const parsed = parseRoundRow(row, {});
            if (!parsed) continue;
            const { round, company } = parsed;
            // Tag sector from thesis when Cala omits it
            if (!company.sectors.length) company.sectors = [sector.toLowerCase()];
            if (companies[company.id]) {
              company.description = company.description || companies[company.id]!.description;
              company.sectors = company.sectors.length ? company.sectors : companies[company.id]!.sectors;
              company.country = company.country ?? companies[company.id]!.country;
              company.entityId = company.entityId ?? companies[company.id]!.entityId;
            }
            companies[company.id] = company;
            roundsById.set(round.id, round);
          }
        } catch (e) {
          rethrowFatal(e);
        }
      }
    }

    // Confirm top companies with graph reads (reuse companyEntity / getCompanyRounds)
    const byCo = new Map<string, Round[]>();
    for (const r of roundsById.values()) {
      const list = byCo.get(r.companyId) ?? [];
      list.push(r);
      byCo.set(r.companyId, list);
    }
    const rankedCos = [...byCo.entries()]
      .map(([id, list]) => {
        const latest = [...list].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0]!;
        return { id, latest, co: companies[id] };
      })
      .sort((a, b) => (b.latest.date ?? "").localeCompare(a.latest.date ?? ""))
      .slice(0, 8);

    const remaining = BUDGET - spent;
    const toConfirm = rankedCos.filter((x) => x.co?.entityId).slice(0, Math.max(0, remaining));
    await mapLimit(toConfirm, CONC, async ({ id, co }) => {
      if (!co?.entityId) return;
      try {
        spent++;
        const ent = await this.companyEntity(co.entityId, ctx);
        const description = (ent.description ?? (propValue(ent.properties, "description") as string | null) ?? "").trim();
        const industries = (ent.relationships?.outgoing?.OPERATES_IN_INDUSTRY ?? []).map((i) => i.name.replace(/_+/g, " ").toLowerCase());
        const sectors = [...new Set([...inferSectors(description), ...industries.map(normalizeSector)])].slice(0, 3);
        companies[id] = {
          ...co,
          description: description || co.description,
          sectors: co.sectors.length ? co.sectors : sectors,
          country: co.country ?? countryFromAddress(propValue(ent.properties, "headquarters_address") as string | null),
          entityId: co.entityId,
        };
        const edges = roundEdges(ent, "ISSUER");
        for (const e of edges) {
          const edge = this.edgeRound(e, { id: co.id, name: co.name }, []);
          if (!roundsById.has(edge.id)) roundsById.set(edge.id, edge);
        }
      } catch (e) {
        rethrowFatal(e);
      }
    });

    return { rounds: [...roundsById.values()], companies };
  }

  async getCompanyProfile(ref: string, ctx: Ctx): Promise<CompanyProfileResult | null> {
    const company = await this.resolveCompany(ref, ctx);
    if (!company) return null;

    let rounds: Round[] = [];
    const founders: CompanyProfileResult["founders"] = [];
    const sources: SourceRef[] = [];

    if (company.entityId) {
      let ent;
      try {
        ent = await this.companyEntityWithPeople(company.entityId, ctx);
      } catch (e) {
        rethrowFatal(e);
        ent = await this.companyEntity(company.entityId, ctx);
      }
      const description = (ent.description ?? (propValue(ent.properties, "description") as string | null) ?? "").trim();
      const industries = (ent.relationships?.outgoing?.OPERATES_IN_INDUSTRY ?? []).map((i) => i.name.replace(/_+/g, " ").toLowerCase());
      company.description = description || company.description;
      company.sectors = company.sectors.length
        ? company.sectors
        : [...new Set([...inferSectors(description), ...industries.map(normalizeSector)])].slice(0, 3);
      company.country = company.country ?? countryFromAddress(propValue(ent.properties, "headquarters_address") as string | null);
      const statusRaw = (propValue(ent.properties, "operational_status") as string | null)?.trim();
      if (statusRaw) company.status = statusRaw.replace(/_+/g, " ");
      const stageRaw = (propValue(ent.properties, "funding_stage") as string | null)?.trim();
      if (stageRaw && !company.status) company.status = stageRaw.replace(/_+/g, " ");

      const incoming = ent.relationships?.incoming ?? {};
      for (const key of ["FOUNDED", "IS_CEO_OF", "IS_FOUNDER_OF"] as const) {
        for (const p of incoming[key] ?? []) {
          const role =
            key === "IS_CEO_OF" ? "CEO" : key === "FOUNDED" || key === "IS_FOUNDER_OF" ? "Founder" : undefined;
          if (!founders.some((f) => normName(f.name) === normName(p.name))) {
            founders.push({ name: p.name, id: p.id, role, pastCompanies: [] });
          }
        }
      }

      const edges = roundEdges(ent, "ISSUER").sort((a, b) => (edgeDate(b) ?? "").localeCompare(edgeDate(a) ?? ""));
      rounds = edges.map((e) => this.edgeRound(e, company, []));
      const details = await mapLimit(edges.slice(0, 6), CONC, async (e) => {
        try {
          return await this.roundDetail(e.id, ctx);
        } catch (err) {
          rethrowFatal(err);
          return null;
        }
      });
      details.forEach((d, i) => {
        if (!d) return;
        const edge = edges[i]!;
        if (!d.round.date) d.round.date = edgeDate(edge);
        if (d.round.sources.length === 0) d.round.sources = parseSources(edge.properties?.sources ?? null);
        rounds[i] = { ...d.round, companyId: company.id, companyName: company.name };
        sources.push(...d.round.sources);
      });
    } else {
      const byId = await this.getCompanyRounds([{ id: company.id, name: company.name, entityId: company.entityId }], ctx, {
        detail: 6,
      });
      rounds = byId[company.id] ?? [];
    }

    rounds.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    if (!company.foundedYear) {
      const oldest = [...rounds].filter((r) => r.date).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))[0];
      if (oldest?.date) company.foundedYear = Number(oldest.date.slice(0, 4)) || undefined;
    }
    const invMap = new Map<string, { name: string; id: string; isLead: boolean | null; roundIds: string[] }>();
    for (const r of rounds) {
      for (const p of r.investors) {
        const row = invMap.get(p.investorId) ?? {
          name: p.investorName,
          id: p.investorId,
          isLead: p.isLead,
          roundIds: [],
        };
        row.roundIds.push(r.id);
        if (p.isLead === true) row.isLead = true;
        invMap.set(p.investorId, row);
      }
      sources.push(...r.sources);
    }

    return {
      company,
      rounds,
      investors: [...invMap.values()],
      founders,
      sources: sources.filter((s, i, arr) => arr.findIndex((x) => (x.url || x.name) === (s.url || s.name)) === i),
    };
  }
}
