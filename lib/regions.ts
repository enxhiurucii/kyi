import type { ThesisRegion } from "./types";

/** Countries belonging to each thesis region (English names as used in demoWorld / Cala). */
export const REGION_COUNTRIES: Record<ThesisRegion, string[]> = {
  Nordics: ["Finland", "Sweden", "Norway", "Denmark", "Iceland"],
  Baltics: ["Estonia", "Latvia", "Lithuania"],
  DACH: ["Germany", "Austria", "Switzerland"],
  Europe: [
    "Finland",
    "Sweden",
    "Norway",
    "Denmark",
    "Iceland",
    "Estonia",
    "Latvia",
    "Lithuania",
    "Germany",
    "Austria",
    "Switzerland",
    "France",
    "United Kingdom",
    "UK",
    "Netherlands",
    "Spain",
    "Italy",
    "Belgium",
    "Ireland",
    "Portugal",
    "Poland",
    "Czech Republic",
    "Czechia",
  ],
  Global: [],
};

export function countriesForRegions(regions: ThesisRegion[]): string[] | null {
  if (!regions.length || regions.includes("Global")) return null;
  const set = new Set<string>();
  for (const r of regions) {
    for (const c of REGION_COUNTRIES[r] ?? []) set.add(c.toLowerCase());
  }
  return [...set];
}

export function countryMatchesRegions(country: string | null | undefined, regions: ThesisRegion[]): boolean {
  if (!regions.length || regions.includes("Global")) return true;
  if (!country?.trim()) return false;
  const allowed = countriesForRegions(regions);
  if (!allowed) return true;
  return allowed.includes(country.trim().toLowerCase());
}
