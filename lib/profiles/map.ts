import type { DataMode, Stage } from "../types";
import { STAGE_ORDER } from "../types";
import type {
  CompanyProfile,
  FounderProfile,
  ImportedFact,
  InvestorList,
  InvestorProfile,
  ListItem,
  ListItemStatus,
  NamedRef,
  ProfileBundle,
  ThesisRegion,
  UserRole,
  WatchlistItem,
} from "./types";

export function encodeNamedRef(r: NamedRef): string {
  if (r.entityId) return JSON.stringify({ name: r.name, entityId: r.entityId });
  return r.name;
}

export function decodeNamedRef(s: string): NamedRef {
  const t = s.trim();
  if (t.startsWith("{")) {
    try {
      const o = JSON.parse(t) as { name?: unknown; entityId?: unknown };
      if (typeof o.name === "string" && o.name.trim()) {
        return { name: o.name.trim(), entityId: typeof o.entityId === "string" ? o.entityId : undefined };
      }
    } catch {
      /* fall through */
    }
  }
  return { name: t };
}

export function encodeNamedRefs(refs: NamedRef[]): string[] {
  return refs.map(encodeNamedRef);
}

export function decodeNamedRefs(xs: string[] | null | undefined): NamedRef[] {
  if (!Array.isArray(xs)) return [];
  return xs.map(decodeNamedRef).filter((r) => r.name);
}

function asStage(s: string | null | undefined): Stage {
  if (s && (STAGE_ORDER as string[]).includes(s)) return s as Stage;
  return "seed";
}

function asFacts(raw: unknown): ImportedFact[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ImportedFact[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    if (typeof o.label !== "string" || typeof o.value !== "string") continue;
    const sources = Array.isArray(o.sources)
      ? o.sources
          .filter((s): s is { name?: string; url?: string; date?: string } => !!s && typeof s === "object")
          .map((s) => ({
            name: typeof s.name === "string" ? s.name : "Source",
            url: typeof s.url === "string" ? s.url : undefined,
            date: typeof s.date === "string" ? s.date : undefined,
          }))
      : [];
    out.push({ label: o.label, value: o.value, sources });
  }
  return out;
}

export type FounderRow = {
  id: string;
  full_name: string;
  role: string | null;
  linkedin_url: string | null;
  location: string | null;
  bio: string | null;
  past_companies: string[] | null;
  schools: string[] | null;
  cala_person_id: string | null;
  cala_snapshot: unknown;
  confirmed_identity: boolean;
  updated_at: string;
};

export type CompanyRow = {
  id: string;
  owner_id: string;
  name: string;
  one_liner: string;
  stage: string;
  country: string | null;
  sectors: string[] | null;
  website: string | null;
  founded_year: number | null;
  raising_amount_eur: number | null;
  existing_investors: string[] | null;
  cala_company_id: string | null;
  cala_snapshot: unknown;
  discoverable?: boolean | null;
  updated_at: string;
};

export type InvestorProfileRow = {
  id: string;
  full_name: string;
  firm_name: string | null;
  cala_firm_id: string | null;
  role_title: string | null;
  thesis_sectors: string[] | null;
  thesis_stages: string[] | null;
  thesis_regions: string[] | null;
  ticket_min_eur: number | null;
  ticket_max_eur: number | null;
  updated_at: string;
};

export type WatchlistRow = {
  id: string;
  user_id: string;
  company_ref: string;
  company_name: string;
  data_mode: string;
  note: string | null;
  created_at: string;
};

export type ListRow = { id: string; company_id: string; name: string; created_at: string };
export type ListItemRow = {
  id: string;
  list_id: string;
  investor_name: string;
  investor_ref: string;
  data_mode: string;
  status: string;
  notes: string | null;
  meeting_at: string | null;
  last_fit_score: number | null;
  updated_at: string;
};

export function founderFromRow(row: FounderRow): FounderProfile {
  return {
    fullName: row.full_name,
    role: row.role ?? undefined,
    linkedinUrl: row.linkedin_url ?? undefined,
    location: row.location ?? undefined,
    bio: row.bio ?? undefined,
    pastCompanies: decodeNamedRefs(row.past_companies),
    schools: decodeNamedRefs(row.schools),
    calaPersonId: row.cala_person_id ?? undefined,
    calaSnapshot: asFacts(row.cala_snapshot),
    confirmedIdentity: row.confirmed_identity,
    updatedAt: row.updated_at,
  };
}

export function companyFromRow(row: CompanyRow): CompanyProfile {
  return {
    id: row.id,
    name: row.name,
    oneLiner: row.one_liner,
    stage: asStage(row.stage),
    country: row.country ?? "",
    sectors: Array.isArray(row.sectors) ? row.sectors : [],
    website: row.website ?? undefined,
    foundedYear: row.founded_year ?? undefined,
    raisingAmountEur: row.raising_amount_eur != null ? Number(row.raising_amount_eur) : undefined,
    existingInvestors: decodeNamedRefs(row.existing_investors),
    calaCompanyId: row.cala_company_id ?? undefined,
    calaSnapshot: asFacts(row.cala_snapshot),
    discoverable: Boolean(row.discoverable),
    updatedAt: row.updated_at,
  };
}

const REGIONS: ThesisRegion[] = ["Nordics", "Baltics", "DACH", "Europe", "Global"];

export function investorFromRow(row: InvestorProfileRow): InvestorProfile {
  const stages = (row.thesis_stages ?? []).filter((s): s is Stage => (STAGE_ORDER as string[]).includes(s));
  const regions = (row.thesis_regions ?? []).filter((r): r is ThesisRegion => (REGIONS as string[]).includes(r));
  return {
    fullName: row.full_name,
    firmName: row.firm_name ?? undefined,
    calaFirmId: row.cala_firm_id ?? undefined,
    roleTitle: row.role_title ?? undefined,
    thesisSectors: Array.isArray(row.thesis_sectors) ? row.thesis_sectors : [],
    thesisStages: stages,
    thesisRegions: regions,
    ticketMinEur: row.ticket_min_eur != null ? Number(row.ticket_min_eur) : undefined,
    ticketMaxEur: row.ticket_max_eur != null ? Number(row.ticket_max_eur) : undefined,
    confirmedFirm: Boolean(row.cala_firm_id),
    updatedAt: row.updated_at,
  };
}

export function investorToRow(userId: string, inv: InvestorProfile) {
  return {
    id: userId,
    full_name: inv.fullName,
    firm_name: inv.firmName ?? null,
    cala_firm_id: inv.calaFirmId ?? null,
    role_title: inv.roleTitle ?? null,
    thesis_sectors: inv.thesisSectors,
    thesis_stages: inv.thesisStages,
    thesis_regions: inv.thesisRegions,
    ticket_min_eur: inv.ticketMinEur ?? null,
    ticket_max_eur: inv.ticketMaxEur ?? null,
    updated_at: inv.updatedAt || new Date().toISOString(),
  };
}

export function watchlistFromRow(row: WatchlistRow): WatchlistItem {
  return {
    id: row.id,
    companyRef: row.company_ref,
    companyName: row.company_name,
    dataMode: row.data_mode === "cala" ? "cala" : "demo",
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

export function listItemFromRow(row: ListItemRow): ListItem {
  return {
    id: row.id,
    investorName: row.investor_name,
    investorRef: row.investor_ref,
    dataMode: row.data_mode === "cala" ? "cala" : "demo",
    status: (row.status as ListItemStatus) || "to_contact",
    notes: row.notes ?? undefined,
    meetingAt: row.meeting_at ?? undefined,
    lastFitScore: row.last_fit_score ?? undefined,
    updatedAt: row.updated_at,
  };
}

export function assembleBundle(
  founder: FounderProfile | null,
  company: CompanyProfile | null,
  lists: InvestorList[],
  activeListId: string | null,
  extras?: {
    roles?: UserRole[];
    investor?: InvestorProfile | null;
    watchlist?: WatchlistItem[];
  },
): ProfileBundle {
  const roles =
    extras?.roles ??
    ([
      ...(founder || company ? (["founder"] as UserRole[]) : []),
      ...(extras?.investor ? (["investor"] as UserRole[]) : []),
    ] as UserRole[]);
  return {
    version: 1,
    roles: [...new Set(roles)],
    founder,
    company,
    investor: extras?.investor ?? null,
    lists,
    activeListId,
    watchlist: extras?.watchlist ?? [],
  };
}

export function founderToRow(userId: string, f: FounderProfile) {
  return {
    id: userId,
    full_name: f.fullName,
    role: f.role ?? null,
    linkedin_url: f.linkedinUrl ?? null,
    location: f.location ?? null,
    bio: f.bio ?? null,
    past_companies: encodeNamedRefs(f.pastCompanies),
    schools: encodeNamedRefs(f.schools),
    cala_person_id: f.calaPersonId ?? null,
    cala_snapshot: f.calaSnapshot ?? null,
    confirmed_identity: f.confirmedIdentity,
    updated_at: f.updatedAt || new Date().toISOString(),
  };
}

export function companyToRow(userId: string, c: CompanyProfile) {
  return {
    ...(c.id ? { id: c.id } : {}),
    owner_id: userId,
    name: c.name,
    one_liner: c.oneLiner,
    stage: c.stage,
    country: c.country || null,
    sectors: c.sectors,
    website: c.website ?? null,
    founded_year: c.foundedYear ?? null,
    raising_amount_eur: c.raisingAmountEur ?? null,
    existing_investors: encodeNamedRefs(c.existingInvestors),
    cala_company_id: c.calaCompanyId ?? null,
    cala_snapshot: c.calaSnapshot ?? null,
    discoverable: Boolean(c.discoverable),
    updated_at: c.updatedAt || new Date().toISOString(),
  };
}

export function isDataMode(x: string): x is DataMode {
  return x === "cala" || x === "demo";
}
