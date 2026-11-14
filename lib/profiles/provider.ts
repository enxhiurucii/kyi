import { calaConfigured } from "../cala/client";
import { newCtx, ProviderError, type Ctx } from "../provider";
import type { DataMode } from "../types";
import * as calaProfiles from "../providers/cala-profiles";
import * as demoProfiles from "../providers/demo-profiles";
import type { ImportCompanyResult, ImportFounderResult, ProfileSearchHit } from "../providers/cala-profiles";

export type { ImportCompanyResult, ImportFounderResult, ProfileSearchHit };

export function resolveProfileMode(requested?: unknown): DataMode {
  if (requested === "demo" || requested === "cala") return requested;
  return calaConfigured() ? "cala" : "demo";
}

function assertCala(mode: DataMode) {
  if (mode === "cala" && !calaConfigured()) {
    throw new ProviderError("Live Cala data needs CALA_API_KEY in .env.local. Switch to demo data or add your key.", "missing_key", 400);
  }
}

export async function searchCompanies(q: string, mode: DataMode, ctx: Ctx = newCtx()): Promise<{ mode: DataMode; results: ProfileSearchHit[] }> {
  assertCala(mode);
  const results = mode === "cala" ? await calaProfiles.searchCompanies(q, ctx) : await demoProfiles.searchCompanies(q, ctx);
  return { mode, results };
}

export async function importCompany(id: string, mode: DataMode, ctx: Ctx = newCtx()): Promise<{ mode: DataMode } & ImportCompanyResult> {
  assertCala(mode);
  const result = mode === "cala" ? await calaProfiles.importCompany(id, ctx) : await demoProfiles.importCompany(id, ctx);
  return { mode, ...result };
}

export async function searchPeople(q: string, mode: DataMode, ctx: Ctx = newCtx()): Promise<{ mode: DataMode; results: ProfileSearchHit[] }> {
  assertCala(mode);
  const results = mode === "cala" ? await calaProfiles.searchPeople(q, ctx) : await demoProfiles.searchPeople(q, ctx);
  return { mode, results };
}

export async function importFounder(id: string, mode: DataMode, ctx: Ctx = newCtx()): Promise<{ mode: DataMode } & ImportFounderResult> {
  assertCala(mode);
  const result = mode === "cala" ? await calaProfiles.importFounder(id, ctx) : await demoProfiles.importFounder(id, ctx);
  return { mode, ...result };
}
