// Browser-side helpers: API calls and URL building (no server imports here).
import type { DataMode, Stage, Startup, Thesis, ThesisRegion } from "./types";
import { STAGE_ORDER } from "./types";

const THESIS_REGIONS: ThesisRegion[] = ["Nordics", "Baltics", "DACH", "Europe", "Global"];

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export async function postJSON<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) throw new ApiError(json.error ?? `Request failed (${res.status})`, res.status, json.code);
  return json as T;
}

export async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) throw new ApiError(json.error ?? `Request failed (${res.status})`, res.status, json.code);
  return json as T;
}

function startupParams(s: Startup, mode: DataMode): URLSearchParams {
  return new URLSearchParams({ d: s.description, s: s.stage, c: s.country, mode });
}

export function reportHref(investor: string, s: Startup, mode: DataMode, extra?: Record<string, string>): string {
  const p = startupParams(s, mode);
  p.set("inv", investor);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
  }
  return `/report?${p}`;
}

export function compareHref(investors: string[], s: Startup, mode: DataMode): string {
  const p = startupParams(s, mode);
  p.set("ids", investors.join("|"));
  return `/compare?${p}`;
}

export function startupFromParams(sp: URLSearchParams): Startup | null {
  const d = sp.get("d") ?? "";
  if (!d.trim()) return null;
  const s = sp.get("s") ?? "seed";
  return {
    description: d,
    stage: (STAGE_ORDER as string[]).includes(s) ? (s as Stage) : "seed",
    country: sp.get("c") ?? "",
  };
}

export function modeFromParams(sp: URLSearchParams): DataMode | undefined {
  const m = sp.get("mode");
  return m === "cala" || m === "demo" ? m : undefined;
}

export function parseInvestorList(text: string): string[] {
  // strip list bullets ("- ", "• ", "1. ") but keep names that start with digits ("500 Global", "8VC")
  return [...new Set(text.split(/\n|;/).map((x) => x.trim().replace(/^(?:[-•*]\s+|\d+[.)]\s+)/, "").trim()).filter(Boolean))];
}

export function thesisToParams(thesis: Thesis, mode?: DataMode): URLSearchParams {
  const p = new URLSearchParams();
  if (thesis.sectors.length) p.set("sectors", thesis.sectors.join(","));
  if (thesis.stages.length) p.set("stages", thesis.stages.join(","));
  if (thesis.regions.length) p.set("regions", thesis.regions.join(","));
  if (thesis.ticketMinEur != null) p.set("tmin", String(thesis.ticketMinEur));
  if (thesis.ticketMaxEur != null) p.set("tmax", String(thesis.ticketMaxEur));
  if (mode) p.set("mode", mode);
  return p;
}

export function thesisFromParams(sp: URLSearchParams): Thesis | null {
  const sectors = (sp.get("sectors") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const stages = (sp.get("stages") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Stage => (STAGE_ORDER as string[]).includes(s));
  const regions = (sp.get("regions") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((r): r is ThesisRegion => (THESIS_REGIONS as string[]).includes(r));
  if (!sectors.length && !stages.length && !regions.length) return null;
  const tmin = sp.get("tmin");
  const tmax = sp.get("tmax");
  return {
    sectors,
    stages,
    regions,
    ticketMinEur: tmin != null && tmin !== "" ? Number(tmin) : undefined,
    ticketMaxEur: tmax != null && tmax !== "" ? Number(tmax) : undefined,
  };
}

export function marketHref(thesis: Thesis, mode?: DataMode): string {
  return `/market?${thesisToParams(thesis, mode)}`;
}

export function companyHref(company: string, thesis?: Thesis | null, mode?: DataMode): string {
  const p = thesis ? thesisToParams(thesis, mode) : new URLSearchParams();
  p.set("q", company);
  if (mode && !p.has("mode")) p.set("mode", mode);
  return `/company?${p}`;
}

export function investorReportHref(investor: string, mode?: DataMode): string {
  const p = new URLSearchParams({ inv: investor });
  if (mode) p.set("mode", mode);
  return `/report?${p}`;
}
