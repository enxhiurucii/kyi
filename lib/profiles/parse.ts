import type { OwnCompanyHint } from "../service";
import type { CompanyProfile, FounderProfile, NamedRef } from "./types";

function parseNamedRef(p: unknown): NamedRef | null {
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  if (typeof o.name !== "string" || !o.name.trim()) return null;
  return {
    name: o.name.trim(),
    entityId: typeof o.entityId === "string" ? o.entityId : undefined,
  };
}

/** Accept a company profile (or partial) from an API body for conflict skipping. */
export function parseOwnCompany(x: unknown): OwnCompanyHint {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim().slice(0, 120) : "";
  const entityId =
    typeof o.calaCompanyId === "string"
      ? o.calaCompanyId.trim()
      : typeof o.entityId === "string"
        ? o.entityId.trim()
        : "";
  if (!name && !entityId) return null;
  return { name: name || undefined, entityId: entityId || undefined };
}

export function parseCompanyBody(x: unknown): Pick<CompanyProfile, "name" | "oneLiner" | "stage" | "country"> | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const oneLiner = typeof o.oneLiner === "string" ? o.oneLiner.trim() : typeof o.description === "string" ? o.description.trim() : "";
  if (!oneLiner) return null;
  return {
    name,
    oneLiner: oneLiner.slice(0, 600),
    stage: typeof o.stage === "string" ? (o.stage as CompanyProfile["stage"]) : "seed",
    country: typeof o.country === "string" ? o.country.slice(0, 60) : "",
  };
}

export function parseFounderBody(x: unknown): FounderProfile | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const fullName = typeof o.fullName === "string" ? o.fullName.trim() : "";
  if (!fullName) return null;
  return {
    fullName: fullName.slice(0, 120),
    role: typeof o.role === "string" ? o.role : undefined,
    pastCompanies: Array.isArray(o.pastCompanies) ? o.pastCompanies.map(parseNamedRef).filter((r): r is NamedRef => r !== null) : [],
    schools: Array.isArray(o.schools) ? o.schools.map(parseNamedRef).filter((r): r is NamedRef => r !== null) : [],
    confirmedIdentity: o.confirmedIdentity === true,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString(),
  };
}
