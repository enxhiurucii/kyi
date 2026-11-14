// Demo profile search / import (section 9) — no Cala calls.

import { ProviderError, type Ctx } from "../provider";
import type { CompanyProfile, FounderProfile, ImportedFact } from "../profiles/types";
import type { Round, SourceRef } from "../types";
import type { ImportCompanyResult, ImportFounderResult, ProfileSearchHit } from "./cala-profiles";

const DEMO_SRC: SourceRef = { name: "KYI demo graph", url: "https://cala.ai" };

const DEMO_FOUNDERS: Array<{
  id: string;
  hit: ProfileSearchHit;
  result: ImportFounderResult;
}> = [
  {
    id: "demo-person-anna",
    hit: {
      id: "demo-person-anna",
      name: "Anna (demo founder)",
      description: "CEO & co-founder of Lumipolku Logistics — ex Kuura Cargo",
      entityType: "Person",
    },
    result: {
      prefill: {
        fullName: "Anna (demo founder)",
        role: "CEO & co-founder",
        location: "Helsinki, Finland",
        pastCompanies: [
          { name: "Kuura Cargo", entityId: "demo-co-kuura" },
          { name: "Lastu Robotics", entityId: "demo-co-lastu" },
        ],
        schools: [{ name: "Aalto University", entityId: "demo-school-aalto" }],
        calaPersonId: "demo-person-anna",
        confirmedIdentity: false,
        updatedAt: new Date().toISOString(),
      },
      facts: [
        { label: "Name", value: "Anna (demo founder)", sources: [DEMO_SRC] },
        { label: "Role", value: "CEO & co-founder", sources: [DEMO_SRC] },
        { label: "Past companies", value: "Kuura Cargo, Lastu Robotics", sources: [DEMO_SRC] },
        { label: "Schools", value: "Aalto University", sources: [DEMO_SRC] },
      ] satisfies ImportedFact[],
    },
  },
];

const DEMO_COMPANIES: Array<{
  id: string;
  hit: ProfileSearchHit;
  result: ImportCompanyResult;
}> = [
  {
    id: "demo-co-lumipolku",
    hit: {
      id: "demo-co-lumipolku",
      name: "Lumipolku Logistics (demo)",
      description: "AI route planning for trucking fleets — cuts empty kilometres and fuel costs",
      entityType: "Company",
    },
    result: {
      prefill: {
        name: "Lumipolku Logistics (demo)",
        oneLiner: "AI route planning for trucking fleets — cuts empty kilometres and fuel costs",
        stage: "seed",
        country: "Finland",
        sectors: ["logistics"],
        raisingAmountEur: 2_500_000,
        existingInvestors: [
          { name: "Revontuli Angels", entityId: "demo-inv-revontuli" },
          { name: "Kettu Ventures", entityId: "demo-inv-kettu" },
        ],
        calaCompanyId: "demo-co-lumipolku",
        updatedAt: new Date().toISOString(),
      } satisfies Partial<CompanyProfile>,
      facts: [
        { label: "Name", value: "Lumipolku Logistics (demo)", sources: [DEMO_SRC] },
        {
          label: "Description",
          value: "AI route planning for trucking fleets — cuts empty kilometres and fuel costs",
          sources: [DEMO_SRC],
        },
        { label: "Country", value: "Finland", sources: [DEMO_SRC] },
        { label: "Funding stage", value: "Seed", sources: [DEMO_SRC] },
        { label: "Sectors", value: "logistics", sources: [DEMO_SRC] },
        { label: "Existing investors", value: "Revontuli Angels, Kettu Ventures", sources: [DEMO_SRC] },
      ],
      rounds: [
        {
          id: "demo-round-lumi-seed",
          entityId: "demo-round-lumi-seed",
          companyId: "demo-co-lumipolku",
          companyName: "Lumipolku Logistics (demo)",
          date: "2025-06-01",
          stage: "seed",
          stageLabel: "Seed",
          amountEur: 2_500_000,
          amountLabel: "€2.5M",
          investors: [
            { investorId: "demo-inv-revontuli", investorName: "Revontuli Angels", isLead: true },
            { investorId: "demo-inv-kettu", investorName: "Kettu Ventures", isLead: false },
          ],
          sources: [DEMO_SRC],
        } satisfies Round,
      ],
    },
  },
  {
    id: "demo-co-kuura",
    hit: {
      id: "demo-co-kuura",
      name: "Kuura Cargo (demo)",
      description: "Cold-chain logistics for Nordic grocery",
      entityType: "Company",
    },
    result: {
      prefill: {
        name: "Kuura Cargo (demo)",
        oneLiner: "Cold-chain logistics for Nordic grocery",
        stage: "series-a",
        country: "Finland",
        sectors: ["logistics"],
        existingInvestors: [{ name: "Sisu Seed Partners" }, { name: "Arctic Loop Capital" }],
        calaCompanyId: "demo-co-kuura",
        updatedAt: new Date().toISOString(),
      },
      facts: [
        { label: "Name", value: "Kuura Cargo (demo)", sources: [DEMO_SRC] },
        { label: "Description", value: "Cold-chain logistics for Nordic grocery", sources: [DEMO_SRC] },
        { label: "Country", value: "Finland", sources: [DEMO_SRC] },
      ],
      rounds: [],
    },
  },
];

function matches(q: string, name: string, description?: string): boolean {
  const qq = normLite(q);
  if (qq.length < 2) return false;
  const hay = `${normLite(name)} ${normLite(description ?? "")}`;
  return hay.includes(qq) || qq.split(/\s+/).every((w) => w.length < 2 || hay.includes(w));
}

function normLite(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Touch ctx so traces stay consistent with live mode. */
function bump(ctx: Ctx, label: string) {
  ctx.queries.push(label);
  ctx.calls++;
}

export async function searchCompanies(q: string, ctx: Ctx): Promise<ProfileSearchHit[]> {
  bump(ctx, `demo search companies: ${q}`);
  return DEMO_COMPANIES.filter((c) => matches(q, c.hit.name, c.hit.description)).map((c) => c.hit);
}

export async function importCompany(id: string, ctx: Ctx): Promise<ImportCompanyResult> {
  bump(ctx, `demo import company: ${id}`);
  const row = DEMO_COMPANIES.find((c) => c.id === id);
  if (!row) {
    // Allow importing by fuzzy name in demo
    const byName = DEMO_COMPANIES.find((c) => normLite(c.hit.name).includes(normLite(id)));
    if (!byName) throw new ProviderError(`Demo company not found: ${id}`, "bad_request", 404);
    return {
      ...byName.result,
      prefill: { ...byName.result.prefill, updatedAt: new Date().toISOString() },
    };
  }
  return {
    ...row.result,
    prefill: { ...row.result.prefill, updatedAt: new Date().toISOString() },
  };
}

export async function searchPeople(q: string, ctx: Ctx): Promise<ProfileSearchHit[]> {
  bump(ctx, `demo search people: ${q}`);
  return DEMO_FOUNDERS.filter((f) => matches(q, f.hit.name, f.hit.description)).map((f) => f.hit);
}

export async function importFounder(id: string, ctx: Ctx): Promise<ImportFounderResult> {
  bump(ctx, `demo import founder: ${id}`);
  const row = DEMO_FOUNDERS.find((f) => f.id === id);
  if (!row) {
    const byName = DEMO_FOUNDERS.find((f) => normLite(f.hit.name).includes(normLite(id)));
    if (!byName) throw new ProviderError(`Demo person not found: ${id}`, "bad_request", 404);
    return {
      ...byName.result,
      prefill: { ...byName.result.prefill, updatedAt: new Date().toISOString() } satisfies Partial<FounderProfile>,
    };
  }
  return {
    ...row.result,
    prefill: { ...row.result.prefill, updatedAt: new Date().toISOString() },
  };
}
