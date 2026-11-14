// Cala graph reads for founder / company profile import (section 5.1–5.2).
// All calls go through lib/cala/client.ts (paced + cached).

import { cala, type CalaEntity, type CalaRelated, type CalaRetrieved } from "../cala/client";
import {
  countryFromAddress,
  eurFrom,
  moneyLabel,
  parseDate,
  parseSources,
  parseStage,
  prettyRoundLabel,
  propValue,
  sourcesFromProperties,
} from "../cala/parse";
import { normName } from "../format";
import type { Ctx } from "../provider";
import type { CompanyProfile, FounderProfile, ImportedFact, NamedRef } from "../profiles/types";
import { inferSectors, normalizeSector } from "../similarity";
import type { Round, SourceRef, Stage } from "../types";

const REL_ROUND = "PARTICIPATES_IN_FUNDING_ROUND";
const COMPANY_TYPES = new Set(["Company", "Organization"]);
const ROUND_PROPS = ["name", "round_label", "announcement_date", "transaction_value", "transaction_value_units", "instrument"];

export interface ProfileSearchHit {
  id: string;
  name: string;
  description?: string;
  entityType: string;
}

export interface ImportCompanyResult {
  prefill: Partial<CompanyProfile>;
  facts: ImportedFact[];
  rounds: Round[];
}

export interface ImportFounderResult {
  prefill: Partial<FounderProfile>;
  facts: ImportedFact[];
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
  return s;
}

function personScore(e: CalaEntity, q: string): number {
  const n = normName(e.name);
  const qq = normName(q);
  let s = 0;
  if (n === qq) s += 4;
  else if (n.includes(qq) || qq.includes(n)) s += 1.5;
  if (e.entity_type === "Person") s += 2;
  if (e.description) s += 0.5;
  return s;
}

function fact(label: string, value: string, sources: SourceRef[]): ImportedFact | null {
  const v = value.trim();
  if (!v) return null;
  return { label, value: v, sources };
}

function relatedName(r: CalaRelated): NamedRef {
  return { name: r.name, entityId: r.id };
}

function toBool(v: unknown): boolean | null {
  if (v === true || v === "true" || v === "TRUE") return true;
  if (v === false || v === "false" || v === "FALSE") return false;
  return null;
}

function mergeSources(...lists: SourceRef[][]): SourceRef[] {
  const out: SourceRef[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const s of list) {
      const k = s.url ?? s.name;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}

async function roundDetail(roundId: string, company: { id: string; name: string }, ctx: Ctx): Promise<Round | null> {
  const r = await cala.retrieve(
    roundId,
    { properties: ROUND_PROPS, relationships: { incoming: { [REL_ROUND]: { limit: 60, offset: 0 } } } },
    ctx,
    `POST /v1/entities/{round} ← ${REL_ROUND} (profile import)`,
  );
  const parts = r.relationships?.incoming?.[REL_ROUND] ?? [];
  const issuer = parts.find((p) => p.properties?.role === "ISSUER");
  const investors = parts
    .filter((p) => p.properties?.role !== "ISSUER")
    .map((p) => ({
      investorId: p.id,
      investorName: p.name,
      isLead: toBool(p.properties?.is_lead),
    }));
  const props = r.properties ?? {};
  const rawLabel = (propValue(props, "round_label") as string | null) ?? (propValue(props, "name") as string | null) ?? r.name;
  const value = Number(propValue(props, "transaction_value"));
  const units = propValue(props, "transaction_value_units") as string | null;
  const hasValue = Number.isFinite(value) && value > 0;
  return {
    id: r.id,
    entityId: r.id,
    companyId: issuer?.id ?? company.id,
    companyName: issuer?.name ?? company.name,
    date: parseDate(propValue(props, "announcement_date")),
    stage: parseStage(rawLabel),
    stageLabel: prettyRoundLabel(rawLabel) || "Round",
    amountEur: hasValue ? eurFrom(value, units) : null,
    amountLabel: hasValue ? moneyLabel(value, units) : null,
    investors,
    sources: sourcesFromProperties(props as Record<string, { sources?: unknown }>),
  };
}

function roundSortKey(e: CalaRelated): string {
  const dates = parseSources(e.properties?.sources ?? null)
    .map((s) => s.date)
    .filter((d): d is string => !!d)
    .sort();
  return dates[dates.length - 1] ?? e.name ?? "";
}

export async function searchCompanies(q: string, ctx: Ctx): Promise<ProfileSearchHit[]> {
  if (q.trim().length < 2) return [];
  const res = await cala.searchEntities(q.trim(), 8, ctx);
  return (res.entities ?? [])
    .filter((e) => COMPANY_TYPES.has(e.entity_type))
    .sort((a, b) => companyScore(b, q) - companyScore(a, q))
    .slice(0, 8)
    .map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description ?? undefined,
      entityType: e.entity_type,
    }));
}

export async function importCompany(id: string, ctx: Ctx): Promise<ImportCompanyResult> {
  const e: CalaRetrieved = await cala.retrieve(
    id,
    {
      properties: [
        "name",
        "description",
        "website",
        "headquarters_address",
        "founding_date",
        "funding_stage",
        "total_funding",
        "total_funding_units",
        "operational_status",
      ],
      relationships: {
        outgoing: {
          OPERATES_IN_INDUSTRY: { limit: 4, offset: 0 },
          [REL_ROUND]: { limit: 30, offset: 0 },
        },
        incoming: {
          FOUNDED: { limit: 10, offset: 0 },
          IS_CEO_OF: { limit: 3, offset: 0 },
        },
      },
    },
    ctx,
    `POST /v1/entities/{company} → profile import`,
  );

  const props = e.properties ?? {};
  const propSources = sourcesFromProperties(props as Record<string, { sources?: unknown }>);
  const description = String(e.description ?? propValue(props, "description") ?? "").trim();
  const website = (propValue(props, "website") as string | null) ?? undefined;
  const address = propValue(props, "headquarters_address") as string | null;
  const country = countryFromAddress(address) ?? "";
  const founding = parseDate(propValue(props, "founding_date"));
  const fundingStageRaw = (propValue(props, "funding_stage") as string | null) ?? "";
  const stage: Stage = fundingStageRaw ? parseStage(fundingStageRaw) : "seed";
  const totalFunding = Number(propValue(props, "total_funding"));
  const totalUnits = propValue(props, "total_funding_units") as string | null;

  const industries = e.relationships?.outgoing?.OPERATES_IN_INDUSTRY ?? [];
  const sectorNames = [
    ...industries.map((i) => normalizeSector(i.name)).filter(Boolean),
    ...inferSectors(description),
  ];
  const sectors = [...new Set(sectorNames.map((s) => s.toLowerCase()))].slice(0, 8);

  const issuerEdges = (e.relationships?.outgoing?.[REL_ROUND] ?? [])
    .filter((edge) => edge.properties?.role === "ISSUER")
    .sort((a, b) => roundSortKey(b).localeCompare(roundSortKey(a)))
    .slice(0, 5);

  const rounds: Round[] = [];
  for (const edge of issuerEdges) {
    try {
      const detail = await roundDetail(edge.id, { id: e.id, name: e.name }, ctx);
      if (detail) rounds.push(detail);
    } catch {
      // Skip a failed round; still return the company prefill.
    }
  }

  const investorMap = new Map<string, NamedRef>();
  for (const r of rounds) {
    for (const p of r.investors) {
      const key = p.investorId || normName(p.investorName);
      if (!key || investorMap.has(key)) continue;
      investorMap.set(key, { name: p.investorName, entityId: p.investorId || undefined });
    }
  }
  const existingInvestors = [...investorMap.values()].slice(0, 30);

  const facts: ImportedFact[] = [
    fact("Name", e.name, propSources),
    fact("Description", description, propSources),
    fact("Website", website ?? "", propSources),
    fact("Country", country, propSources),
    fact("Funding stage", prettyRoundLabel(fundingStageRaw) || fundingStageRaw, propSources),
    fact(
      "Total funding",
      Number.isFinite(totalFunding) && totalFunding > 0 ? moneyLabel(totalFunding, totalUnits) : "",
      propSources,
    ),
    fact("Sectors", sectors.join(", "), industries.flatMap((i) => parseSources(i.properties?.sources ?? null))),
    fact(
      "Existing investors",
      existingInvestors.map((i) => i.name).join(", "),
      mergeSources(...rounds.map((r) => r.sources)),
    ),
  ].filter((f): f is ImportedFact => f !== null);

  const prefill: Partial<CompanyProfile> = {
    name: e.name,
    oneLiner: description.slice(0, 600),
    stage: stage === "unknown" ? "seed" : stage,
    country,
    sectors,
    website: website?.trim() || undefined,
    foundedYear: founding ? Number(founding.slice(0, 4)) || undefined : undefined,
    raisingAmountEur: undefined,
    existingInvestors,
    calaCompanyId: e.id,
    updatedAt: new Date().toISOString(),
  };

  return { prefill, facts, rounds };
}

export async function searchPeople(q: string, ctx: Ctx): Promise<ProfileSearchHit[]> {
  if (q.trim().length < 2) return [];
  const res = await cala.searchEntities(q.trim(), 8, ctx);
  return (res.entities ?? [])
    .filter((e) => e.entity_type === "Person")
    .sort((a, b) => personScore(b, q) - personScore(a, q))
    .slice(0, 8)
    .map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description ?? undefined,
      entityType: e.entity_type,
    }));
}

export async function importFounder(id: string, ctx: Ctx): Promise<ImportFounderResult> {
  const e = await cala.retrieve(
    id,
    {
      properties: ["name", "description", "linkedin_url"],
      relationships: {
        outgoing: {
          FOUNDED: { limit: 10, offset: 0 },
          WORKS_AT: { limit: 15, offset: 0 },
          IS_CEO_OF: { limit: 5, offset: 0 },
          STUDIED_AT: { limit: 5, offset: 0 },
          INVESTED_IN: { limit: 20, offset: 0 },
        },
      },
    },
    ctx,
    `POST /v1/entities/{person} → founder import`,
  );

  const props = e.properties ?? {};
  const propSources = sourcesFromProperties(props as Record<string, { sources?: unknown }>);
  const linkedinUrl = (propValue(props, "linkedin_url") as string | null) ?? undefined;
  const description = String(e.description ?? propValue(props, "description") ?? "").trim();

  const founded = e.relationships?.outgoing?.FOUNDED ?? [];
  const worksAt = e.relationships?.outgoing?.WORKS_AT ?? [];
  const ceoOf = e.relationships?.outgoing?.IS_CEO_OF ?? [];
  const schoolsRel = e.relationships?.outgoing?.STUDIED_AT ?? [];

  const companyMap = new Map<string, NamedRef>();
  for (const r of [...founded, ...worksAt, ...ceoOf]) {
    if (!companyMap.has(r.id)) companyMap.set(r.id, relatedName(r));
  }
  const pastCompanies = [...companyMap.values()].slice(0, 20);
  const schools = schoolsRel.map(relatedName).slice(0, 10);

  const roleFromEdge =
    [...worksAt, ...ceoOf].map((r) => (typeof r.properties?.role === "string" ? r.properties.role : "")).find((r) => r.trim()) ||
    undefined;

  const facts: ImportedFact[] = [
    fact("Name", e.name, propSources),
    fact("LinkedIn", linkedinUrl ?? "", propSources),
    fact("Role", roleFromEdge ?? "", worksAt.flatMap((r) => parseSources(r.properties?.sources ?? null))),
    fact(
      "Past companies",
      pastCompanies.map((c) => c.name).join(", "),
      [...founded, ...worksAt, ...ceoOf].flatMap((r) => parseSources(r.properties?.sources ?? null)),
    ),
    fact(
      "Schools",
      schools.map((s) => s.name).join(", "),
      schoolsRel.flatMap((r) => parseSources(r.properties?.sources ?? null)),
    ),
    fact("About", description.slice(0, 400), propSources),
  ].filter((f): f is ImportedFact => f !== null);

  const prefill: Partial<FounderProfile> = {
    fullName: e.name,
    role: roleFromEdge,
    linkedinUrl: linkedinUrl?.trim() || undefined,
    bio: description.slice(0, 600) || undefined,
    pastCompanies,
    schools,
    calaPersonId: e.id,
    confirmedIdentity: false,
    updatedAt: new Date().toISOString(),
  };

  return { prefill, facts };
}
