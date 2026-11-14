import { normName } from "../format";
import type { CompanyRef, Ctx, DataProvider, InvestorRoundsResult } from "../provider";
import { countryMatchesRegions } from "../regions";
import type { Company, CompanyProfileResult, Investor, Round, SourceRef, Thesis } from "../types";
import { getDemoWorld } from "./demoWorld";
import { CALA_QUERIES } from "../cala/queries";

/** Deterministic fictional founders from company id. */
function demoFounders(company: Company): CompanyProfileResult["founders"] {
  const seed = company.id.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const FIRST = ["Aino", "Elias", "Sofia", "Mikko", "Liisa", "Juhan", "Greta", "Oskar"];
  const LAST = ["Korhonen", "Virtanen", "Nieminen", "Lindberg", "Saar", "Mäkinen", "Berg", "Hansen"];
  const f1 = `${FIRST[seed % FIRST.length]} ${LAST[(seed * 3) % LAST.length]}`;
  const f2 = `${FIRST[(seed * 5) % FIRST.length]} ${LAST[(seed * 7) % LAST.length]}`;
  if (f1 === f2) {
    return [{ name: f1, role: "CEO & co-founder", pastCompanies: [] }];
  }
  return [
    { name: f1, role: "CEO & co-founder", pastCompanies: [] },
    { name: f2, role: "CTO & co-founder", pastCompanies: [] },
  ];
}

/** Synthetic data provider. Mirrors the queries the Cala provider would send, so the UI trace stays honest. */
export class DemoProvider implements DataProvider {
  readonly mode = "demo" as const;

  async searchInvestors(q: string, ctx: Ctx): Promise<Investor[]> {
    ctx.calls++;
    const w = getDemoWorld();
    const n = normName(q);
    if (!n) return w.investors.filter((i) => w.profileInvestorNames.includes(i.name)).slice(0, 10);
    return w.investors
      .filter((i) => normName(i.name).includes(n))
      .sort((a, b) => Number(w.profileInvestorNames.includes(b.name)) - Number(w.profileInvestorNames.includes(a.name)))
      .slice(0, 10);
  }

  async resolveInvestor(q: string, ctx: Ctx): Promise<Investor | null> {
    ctx.queries.push(`GET /v1/entities?name=${q}  (demo: not sent)`);
    ctx.calls++;
    const w = getDemoWorld();
    const n = normName(q);
    return w.investors.find((i) => i.id === q || normName(i.name) === n) ?? w.investors.find((i) => normName(i.name).includes(n) && n.length >= 3) ?? null;
  }

  async searchCompanies(q: string, ctx: Ctx): Promise<Company[]> {
    ctx.calls++;
    const w = getDemoWorld();
    const list = Object.values(w.companies);
    const n = normName(q);
    if (!n) return list.slice(0, 10);
    return list.filter((c) => normName(c.name).includes(n) || normName(c.description).includes(n)).slice(0, 10);
  }

  async resolveCompany(q: string, ctx: Ctx): Promise<Company | null> {
    ctx.queries.push(`GET /v1/entities?name=${q}  (demo: not sent)`);
    ctx.calls++;
    const w = getDemoWorld();
    const n = normName(q);
    const all = Object.values(w.companies);
    return all.find((c) => c.id === q || normName(c.name) === n) ?? all.find((c) => normName(c.name).includes(n) && n.length >= 3) ?? null;
  }

  async getInvestorRounds(inv: Investor, ctx: Ctx): Promise<InvestorRoundsResult> {
    ctx.queries.push(`${CALA_QUERIES.investorRounds(inv.name)}  (demo: not sent)`);
    ctx.calls++;
    const w = getDemoWorld();
    const rounds = w.rounds.filter((r) => r.investors.some((p) => p.investorId === inv.id));
    const companies: Record<string, Company> = {};
    for (const r of rounds) companies[r.companyId] = w.companies[r.companyId];
    return { rounds, companies };
  }

  async getCompanyRounds(refs: CompanyRef[], ctx: Ctx, _opts?: { detail?: number }): Promise<Record<string, Round[]>> {
    const w = getDemoWorld();
    const out: Record<string, Round[]> = {};
    for (const ref of refs) {
      ctx.calls++;
      out[ref.id] = w.rounds.filter((r) => r.companyId === ref.id);
    }
    if (refs[0]) ctx.queries.push(`${CALA_QUERIES.companyRounds(refs[0].name)}  (demo: not sent, ×${refs.length} companies)`);
    return out;
  }

  async enrichCompanies(_refs: CompanyRef[], known: Record<string, Company>): Promise<Record<string, Company>> {
    return known;
  }

  async getSources(round: Round, ctx: Ctx): Promise<{ answer?: string; sources: SourceRef[] }> {
    ctx.queries.push(`${CALA_QUERIES.roundSources(round.companyName, round.stageLabel, round.date?.slice(0, 4))}  (demo: not sent)`);
    return {
      answer: "This is a synthetic demo record. Switch to live Cala data to see real, sourced funding rounds.",
      sources: round.sources,
    };
  }

  async getSectorRounds(thesis: Thesis, ctx: Ctx): Promise<{ rounds: Round[]; companies: Record<string, Company> }> {
    const sectors = thesis.sectors.map((s) => s.toLowerCase());
    ctx.queries.push(
      `sectorRounds(${sectors.join("|")}, ${thesis.regions.join("+")})  (demo: filter getDemoWorld)`,
    );
    ctx.calls++;
    const w = getDemoWorld();
    const companies: Record<string, Company> = {};
    const rounds: Round[] = [];
    for (const r of w.rounds) {
      const co = w.companies[r.companyId];
      if (!co) continue;
      if (sectors.length && !co.sectors.some((s) => sectors.includes(s.toLowerCase()))) continue;
      if (!countryMatchesRegions(co.country, thesis.regions)) continue;
      rounds.push(r);
      companies[co.id] = co;
    }
    return { rounds, companies };
  }

  async getCompanyProfile(ref: string, ctx: Ctx): Promise<CompanyProfileResult | null> {
    ctx.queries.push(`GET company profile ${ref}  (demo)`);
    ctx.calls++;
    const company = await this.resolveCompany(ref, ctx);
    if (!company) return null;
    const w = getDemoWorld();
    const rounds = w.rounds
      .filter((r) => r.companyId === company.id)
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
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
    }
    const oldest = [...rounds].filter((r) => r.date).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))[0];
    const enriched = {
      ...company,
      foundedYear: oldest?.date ? Number(oldest.date.slice(0, 4)) || undefined : undefined,
      status: rounds[0] ? `Last: ${rounds[0].stageLabel}` : "Operating",
    };
    return {
      company: enriched,
      rounds,
      investors: [...invMap.values()],
      founders: demoFounders(company),
      sources: rounds.flatMap((r) => r.sources),
    };
  }
}
