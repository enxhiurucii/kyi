// All Cala queries in one place, so you can tune them quickly after testing in the Cala console.
//
// Cala's dot-notation ("Cala QL"): each "." is one hop across the knowledge graph.
//   filters → order_by → limit → return(fields)
// Field names are interpreted loosely by Cala, so write what you mean.
// Docs: https://docs.cala.ai/api-reference/query

/** Dots inside names would be read as graph hops — strip them. */
export function qlSafe(name: string): string {
  return name.replace(/[.]/g, " ").replace(/\s+/g, " ").trim();
}

export const CALA_QUERIES = {
  /** Every round an investor took part in, newest first, with what we need for the report card. */
  investorRounds: (investor: string) =>
    `funding_rounds.investors=${qlSafe(investor)}.order_by=date DESC.limit=80.return(company, company_description, sector, company_country, round_type, date, amount, investors, lead_investors)`,

  /** Natural-language fallback if the dot-notation query comes back empty. */
  investorRoundsNatural: (investor: string) =>
    `All funding rounds in which ${qlSafe(investor)} invested since 2018, with company name, company description, sector, country, round type, date, amount, all investors and the lead investor`,

  /** All rounds of one company, oldest first (to see what happened after an investor came in). */
  companyRounds: (company: string) =>
    `funding_rounds.company=${qlSafe(company)}.order_by=date ASC.return(company, round_type, date, amount, investors, lead_investors)`,

  /** Narrative + citations for one round (used when the user clicks "Show sources"). */
  roundSources: (company: string, stageLabel: string, year?: string) =>
    `Who invested in ${qlSafe(company)}'s ${stageLabel || "latest"} funding round${year ? ` in ${year}` : ""}, how much was raised, and who led it?`,

  /**
   * Sector + geography funding sample for market radar.
   * Structured QL works best with a real country (e.g. Finland); region labels like "Nordics"
   * usually need the natural-language fallback. Probe with `npm run probe -- --query "…"`.
   */
  sectorRounds: (term: string, country: string, sinceDate: string) =>
    `funding_rounds.sector=${qlSafe(term)}.company_country=${qlSafe(country)}.date>=${sinceDate}.order_by=date DESC.limit=50.return(company, company_description, sector, company_country, round_type, date, amount, investors, lead_investors)`,

  sectorRoundsNatural: (term: string, region: string, sinceYear: number) =>
    `Funding rounds since ${sinceYear} for ${qlSafe(term)} startups in ${qlSafe(region === "Global" ? "Europe and globally" : `the ${region}`)} with company, description, country, round type, date, amount, investors and lead investor`,
};

/** Map KYI sector keys → Cala-friendly search terms. */
export const SECTOR_CALA_TERM: Record<string, string> = {
  logistics: "logistics",
  mobility: "mobility",
  fintech: "fintech",
  health: "healthtech",
  climate: "climate tech",
  devtools: "developer tools",
  security: "cybersecurity",
  retail: "e-commerce",
  food: "food tech",
  hr: "HR tech",
  education: "edtech",
  deeptech: "deep tech",
  gaming: "gaming",
};
