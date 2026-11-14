/** Parse a startup.country field that may list several markets. */
export function parseCountries(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return [...new Set(raw.split(/[,;/|]+/).map((x) => x.trim()).filter(Boolean))];
}

export function formatCountries(xs: string[]): string {
  return [...new Set(xs.map((x) => x.trim()).filter(Boolean))].join(", ");
}

export function toggleCountry(raw: string, name: string): string {
  const cur = parseCountries(raw);
  const hit = cur.findIndex((c) => c.toLowerCase() === name.toLowerCase());
  if (hit >= 0) cur.splice(hit, 1);
  else cur.push(name);
  return formatCountries(cur);
}

export const MARKET_PRESETS = [
  "Finland",
  "Sweden",
  "Norway",
  "Denmark",
  "Estonia",
  "Latvia",
  "Lithuania",
  "Germany",
  "UK",
  "Netherlands",
  "France",
  "US",
] as const;
