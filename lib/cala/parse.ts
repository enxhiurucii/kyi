// Lenient parsing of Cala query rows into our Round / Company types.
// Cala's structured rows are shaped by the query, so field names can vary
// ("round_type" vs "series", "amount" vs "funding_amount"...). We accept the common variants,
// and numbers like "€38.9M ($37.2M)", "over 100M" or "~206,753".

import { normName, slug } from "../format";
import { inferSectors, normalizeSector } from "../similarity";
import type { Company, Participation, Round, SourceRef, Stage } from "../types";
import { STAGE_LABEL } from "../types";

type Row = Record<string, unknown>;

const KEYS = {
  company: ["company", "company_name", "startup", "organization", "organisation", "target", "recipient", "raised_by", "name"],
  stage: ["round_type", "series", "stage", "round", "funding_type", "funding_round_type", "type", "round_name", "funding_round"],
  date: ["date", "announced_date", "announcement_date", "announced_on", "closing_date", "funding_date", "date_announced", "year"],
  amount: ["amount", "funding_amount", "money_raised", "amount_raised", "raised", "round_size", "size", "value", "funding"],
  investors: ["investors", "investor_names", "participants", "backers", "investor", "all_investors"],
  leads: ["lead_investors", "lead_investor", "led_by", "lead", "leads", "lead_investor_names"],
  description: ["company_description", "description", "company_summary", "summary", "what_they_do", "business_description"],
  sector: ["sector", "industry", "industries", "company_sector", "category", "vertical", "sectors"],
  country: ["company_country", "country", "location", "company_location", "hq", "headquarters", "hq_country"],
  sources: ["sources", "source", "source_url", "source_urls", "url", "urls", "reference", "references", "link", "links"],
};

function canon(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function get(row: Row, keys: string[]): unknown {
  const map = new Map(Object.keys(row).map((k) => [canon(k), k]));
  for (const k of keys) {
    const real = map.get(canon(k));
    const v = real !== undefined ? row[real] : undefined;
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "string" && /^\s*([—–-]+|n\/?a|none|null|unknown)\s*$/i.test(v)) continue; // Cala uses "—" for "no data"
    return v;
  }
  return undefined;
}

/** Unwrap Cala property objects ({value, sources}) and entity stubs ({name}). */
function unwrap(v: unknown): unknown {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if ("value" in o) return unwrap(o.value);
    if (typeof o.name === "string") return o.name;
  }
  return v;
}

export function asText(v: unknown): string | null {
  const u = unwrap(v);
  if (u === null || u === undefined) return null;
  if (typeof u === "string") return u.trim() || null;
  if (typeof u === "number" || typeof u === "boolean") return String(u);
  if (Array.isArray(u)) return u.map(asText).filter(Boolean).join(", ") || null;
  return null;
}

export function asList(v: unknown): string[] {
  const u = unwrap(v);
  if (u === null || u === undefined) return [];
  if (Array.isArray(u)) return u.flatMap((x) => asList(x));
  const s = asText(u);
  if (!s) return [];
  return s
    .split(/\s*(?:,|;|\band\b|\n)\s*/i)
    .map((x) => x.trim())
    .filter((x) => x.length > 1 && !/^(n\/?a|none|unknown|undisclosed( investors?)?|(and )?others?|other investors|[—–-]+)$/i.test(x));
}

// ---------- Stage ----------

export function parseStage(label: string | null): Stage {
  if (!label) return "unknown";
  const s = label.toLowerCase().replace(/_+/g, " ");
  if (/pre[\s-]?seed|angel/.test(s)) return "pre-seed";
  if (/\bseed\b/.test(s)) return "seed";
  if (/series\s*a\b|\ba round\b|^a$/.test(s)) return "series-a";
  if (/series\s*b\b|^b$/.test(s)) return "series-b";
  if (/series\s*[c-z]\b|^[c-h]$/.test(s)) return "series-c+";
  if (/growth|late|private equity|pe round|expansion|mezzanine|ipo/.test(s)) return "growth";
  return "unknown";
}

// ---------- Dates ----------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

export function parseDate(v: unknown): string | null {
  const u = unwrap(v);
  if (typeof u === "number" && u > 1900 && u < 2100) return `${u}-07-01`;
  const s = asText(u);
  if (!s) return null;
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/(\d{4})-(\d{1,2})\b/);
  if (m) return `${m[1]}-${pad(+m[2])}-15`;
  m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/); // dd/mm/yyyy
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  m = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/); // July 15, 2025
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[1].slice(0, 3).toLowerCase()])}-${pad(+m[2])}`;
  m = s.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b/); // 15 July 2025
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[2].slice(0, 3).toLowerCase()])}-${pad(+m[1])}`;
  m = s.match(/\b([A-Za-z]{3,9})\.?\s+(\d{4})\b/); // Jul 2025
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return `${m[2]}-${pad(MONTHS[m[1].slice(0, 3).toLowerCase()])}-15`;
  m = s.match(/\bQ([1-4])\s*[-/ ]?\s*(\d{4})\b|\b(\d{4})\s*[-/ ]?\s*Q([1-4])\b/i);
  if (m) {
    const q = +(m[1] ?? m[4]);
    const y = m[2] ?? m[3];
    return `${y}-${pad(q * 3 - 1)}-15`;
  }
  m = s.match(/\b(19|20)\d{2}\b/);
  if (m) return `${m[0]}-07-01`;
  return null;
}

// ---------- Money ----------

const TO_EUR: Record<string, number> = { EUR: 1, USD: 0.92, GBP: 1.17, SEK: 0.087, NOK: 0.085, DKK: 0.134, CHF: 1.05, JPY: 0.0061, CAD: 0.67, AUD: 0.6, INR: 0.011 };
const SYMBOL: Record<string, string> = { "€": "EUR", $: "USD", "£": "GBP", "¥": "JPY" };

export function parseMoney(v: unknown): { eur: number | null; label: string | null } {
  const u = unwrap(v);
  if (typeof u === "number") return { eur: u, label: `€${u}` };
  const s = asText(u);
  if (!s) return { eur: null, label: null };
  const m = s.match(/(€|\$|£|¥|EUR|USD|GBP|SEK|NOK|DKK|CHF|JPY|CAD|AUD|INR)?\s*~?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|m|mm|mn|million|b|bn|billion)?\b\s*(EUR|USD|GBP|SEK|NOK|DKK|CHF)?/i);
  if (!m) return { eur: null, label: s };
  const cur = (m[1] ? SYMBOL[m[1]] ?? m[1].toUpperCase() : m[4]?.toUpperCase()) ?? "EUR";
  let n = parseFloat(m[2].replace(/,/g, ""));
  const unit = (m[3] ?? "").toLowerCase();
  if (unit === "k" || unit === "thousand") n *= 1e3;
  else if (["m", "mm", "mn", "million"].includes(unit)) n *= 1e6;
  else if (["b", "bn", "billion"].includes(unit)) n *= 1e9;
  const rate = TO_EUR[cur] ?? 1;
  return { eur: Number.isFinite(n) ? n * rate : null, label: s };
}

// ---------- Sources ----------

export function parseSources(v: unknown): SourceRef[] {
  if (v === null || v === undefined) return [];
  const items = Array.isArray(v) ? v : [v];
  const out: SourceRef[] = [];
  for (const it of items) {
    if (typeof it === "string") {
      const url = it.match(/https?:\/\/\S+/)?.[0];
      out.push(url ? { name: hostOf(url), url } : { name: it });
    } else if (it && typeof it === "object") {
      const o = it as Record<string, unknown>;
      const doc = o.document;
      let url: string | undefined;
      if (typeof o.url === "string") url = o.url;
      else if (typeof doc === "string") url = doc;
      else if (doc && typeof doc === "object") {
        const d = doc as Record<string, unknown>;
        if (typeof d.url === "string") url = d.url;
        else if (typeof d.endpoint === "string") url = d.endpoint;
      }
      const name = typeof o.name === "string" && o.name ? o.name : url ? hostOf(url) : "Source";
      out.push({ name, url: url || undefined, date: typeof o.date === "string" ? o.date : undefined });
    }
  }
  return out;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---------- Rows → domain ----------

export interface ParsedRow {
  round: Round;
  company: Company;
}

/**
 * Parse one structured row into a Round + Company.
 * `fallbackCompany` is used when the row has no company field (e.g. a company-rounds query).
 */
export function parseRoundRow(row: Row, opts: { fallbackCompany?: { id: string; name: string }; investorHint?: string }): ParsedRow | null {
  const companyName = asText(get(row, KEYS.company)) ?? opts.fallbackCompany?.name ?? null;
  if (!companyName) return null;
  const companyId = opts.fallbackCompany?.id ?? slug(companyName);

  const stageLabel = asText(get(row, KEYS.stage)) ?? "";
  const stage = parseStage(stageLabel);
  const date = parseDate(get(row, KEYS.date));
  const money = parseMoney(get(row, KEYS.amount));

  const leadNames = asList(get(row, KEYS.leads)).map(cleanInvestorName);
  const leadKnown = get(row, KEYS.leads) !== undefined;
  const investorNamesRaw = asList(get(row, KEYS.investors));
  const parts: Participation[] = [];
  const seen = new Set<string>();
  const addPart = (rawName: string, forceLead?: boolean) => {
    const isLeadMarked = /\(\s*lead\s*\)|\blead\b/i.test(rawName);
    const name = cleanInvestorName(rawName);
    const key = normName(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const isLead = forceLead || isLeadMarked || leadNames.some((l) => normName(l) === key) ? true : leadKnown ? false : null;
    parts.push({ investorId: slug(name), investorName: name, isLead });
  };
  for (const l of leadNames) addPart(l, true);
  for (const n of investorNamesRaw) addPart(n);

  const description = asText(get(row, KEYS.description)) ?? "";
  const sectorText = asText(get(row, KEYS.sector)) ?? "";
  const sectors = dedupeStrings([...(sectorText ? sectorText.split(/,|;|\//).map((s) => normalizeSector(s)) : []), ...inferSectors(description)]).slice(0, 3);
  const country = asText(get(row, KEYS.country));

  const round: Round = {
    id: `${companyId}-${stage}-${date ?? "nodate"}-${slug(stageLabel || "round")}`,
    companyId,
    companyName,
    date,
    stage,
    stageLabel: stageLabel || STAGE_LABEL[stage],
    amountEur: money.eur,
    amountLabel: money.label,
    investors: parts,
    sources: parseSources(get(row, KEYS.sources)),
  };
  const company: Company = { id: companyId, name: companyName, description, sectors, country: country ? cleanCountry(country) : null };
  return { round, company };
}

function cleanInvestorName(s: string): string {
  return s.replace(/\(\s*lead\s*\)/gi, "").replace(/\s+-\s*lead$/i, "").replace(/^lead(?:\s*investor)?\s*:\s*/i, "").trim();
}

function cleanCountry(s: string): string {
  // "Helsinki, Finland" → "Finland"
  const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? s;
}

function dedupeStrings(xs: string[]): string[] {
  return [...new Set(xs.filter(Boolean))];
}

// ---------- Graph helpers (entity retrieval) ----------

/** "SERIES_A" → "Series A", "PRE_SEED" → "Pre-seed" */
export function prettyRoundLabel(label: string | null): string {
  if (!label) return "";
  const s = label.replace(/_+/g, " ").toLowerCase().trim();
  if (s === "pre seed") return "Pre-seed";
  return s.replace(/\b(series|seed|growth|venture|grant|debt|round|extension|bridge|angel|convertible|note|equity|private|ipo)\b/g, (w) => w[0].toUpperCase() + w.slice(1)).replace(/\bseries ([a-z])\b/gi, (_, l: string) => `Series ${l.toUpperCase()}`).replace(/^./, (c) => c.toUpperCase());
}

export function eurFrom(value: number, units: string | null | undefined): number {
  return value * (TO_EUR[(units ?? "EUR").toUpperCase()] ?? 1);
}

const CUR_SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", JPY: "¥" };

/** 500000 EUR → "€500k", 3200000 USD → "$3.2M" */
export function moneyLabel(value: number, units: string | null | undefined): string {
  const cur = (units ?? "EUR").toUpperCase();
  const sym = CUR_SYMBOL[cur] ?? "";
  const suffix = sym ? "" : ` ${cur}`;
  const n =
    value >= 1e9 ? `${(value / 1e9).toFixed(1).replace(/\.0$/, "")}B` : value >= 1e6 ? `${(value / 1e6).toFixed(1).replace(/\.0$/, "")}M` : value >= 1e3 ? `${Math.round(value / 1e3)}k` : `${Math.round(value)}`;
  return `${sym}${n}${suffix}`;
}

const ISO2: Record<string, string> = {
  FI: "Finland", SE: "Sweden", NO: "Norway", DK: "Denmark", IS: "Iceland", EE: "Estonia", LV: "Latvia", LT: "Lithuania",
  DE: "Germany", FR: "France", GB: "United Kingdom", UK: "United Kingdom", NL: "Netherlands", BE: "Belgium", ES: "Spain",
  PT: "Portugal", IT: "Italy", CH: "Switzerland", AT: "Austria", PL: "Poland", IE: "Ireland", US: "United States",
  CA: "Canada", IL: "Israel", SG: "Singapore", LU: "Luxembourg", CZ: "Czechia", UA: "Ukraine", IN: "India", JP: "Japan",
};

/** "Itämerenkatu 1, Helsinki, FI-18, 00180, FI" → "Finland" */
export function countryFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const tail = address.split(",").map((x) => x.trim()).filter(Boolean).pop() ?? "";
  if (ISO2[tail.toUpperCase()]) return ISO2[tail.toUpperCase()];
  for (const name of Object.values(ISO2)) if (address.toLowerCase().includes(name.toLowerCase())) return name;
  return null;
}

/** Collect every source attached to any property of a retrieved entity (deduped by URL). */
export function sourcesFromProperties(props: Record<string, { sources?: unknown }> | undefined): SourceRef[] {
  const out: SourceRef[] = [];
  const seen = new Set<string>();
  for (const p of Object.values(props ?? {})) {
    for (const s of parseSources(p?.sources ?? null)) {
      const k = s.url ?? s.name;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}

export function propValue(props: Record<string, { value?: unknown }> | undefined, key: string): unknown {
  return props?.[key]?.value ?? null;
}
