import type { DataMode, SourceRef, Stage } from "../types";

export type UserRole = "founder" | "investor";

export type ThesisRegion = "Nordics" | "Baltics" | "DACH" | "Europe" | "Global";

export interface NamedRef {
  name: string;
  entityId?: string;
}

export interface ImportedFact {
  label: string;
  value: string;
  sources: SourceRef[];
}

export interface FounderProfile {
  fullName: string;
  role?: string;
  linkedinUrl?: string;
  location?: string;
  bio?: string;
  pastCompanies: NamedRef[];
  schools: NamedRef[];
  calaPersonId?: string;
  /** Imported Cala facts (with sources) — persisted as cala_snapshot when signed in. */
  calaSnapshot?: ImportedFact[];
  confirmedIdentity: boolean;
  updatedAt: string;
}

export interface CompanyProfile {
  /** Supabase row id when synced to an account. */
  id?: string;
  name: string;
  oneLiner: string;
  stage: Stage;
  country: string;
  sectors: string[];
  website?: string;
  foundedYear?: number;
  raisingAmountEur?: number;
  existingInvestors: NamedRef[];
  calaCompanyId?: string;
  /** Imported Cala facts (with sources) — persisted as cala_snapshot when signed in. */
  calaSnapshot?: ImportedFact[];
  /** Opt-in: matching investors may discover this startup (limited fields). */
  discoverable?: boolean;
  updatedAt: string;
}

export interface InvestorProfile {
  fullName: string;
  firmName?: string;
  calaFirmId?: string;
  roleTitle?: string;
  thesisSectors: string[];
  thesisStages: Stage[];
  thesisRegions: ThesisRegion[];
  ticketMinEur?: number;
  ticketMaxEur?: number;
  confirmedFirm: boolean;
  updatedAt: string;
}

export interface WatchlistItem {
  id: string;
  companyRef: string;
  companyName: string;
  dataMode: DataMode;
  note?: string;
  createdAt: string;
}

export type ListItemStatus = "to_contact" | "contacted" | "meeting_booked" | "met" | "follow_up" | "passed" | "committed";

export interface ListItem {
  id: string;
  investorName: string;
  investorRef: string;
  dataMode: DataMode;
  status: ListItemStatus;
  notes?: string;
  meetingAt?: string;
  lastFitScore?: number;
  updatedAt: string;
}

export interface InvestorList {
  id: string;
  name: string;
  createdAt: string;
  items: ListItem[];
}

export interface ProfileBundle {
  version: 1;
  roles: UserRole[];
  founder: FounderProfile | null;
  company: CompanyProfile | null;
  investor: InvestorProfile | null;
  lists: InvestorList[];
  activeListId: string | null;
  watchlist: WatchlistItem[];
}

/** Swappable later for a Supabase-backed store without touching UI. */
export interface ProfileStore {
  getRoles(): UserRole[];
  setRoles(roles: UserRole[]): void;
  getFounder(): FounderProfile | null;
  saveFounder(f: FounderProfile): void;
  getCompany(): CompanyProfile | null;
  saveCompany(c: CompanyProfile): void;
  getInvestor(): InvestorProfile | null;
  saveInvestor(inv: InvestorProfile): void;
  getLists(): InvestorList[];
  getActiveListId(): string | null;
  setActiveListId(id: string | null): void;
  saveList(list: InvestorList): void;
  deleteList(id: string): void;
  upsertItem(listId: string, item: Omit<ListItem, "id" | "updatedAt"> & { id?: string }): ListItem | null;
  updateItem(listId: string, itemId: string, patch: Partial<ListItem>): ListItem | null;
  removeItem(listId: string, itemId: string): void;
  getWatchlist(): WatchlistItem[];
  upsertWatchlistItem(item: Omit<WatchlistItem, "id" | "createdAt"> & { id?: string; createdAt?: string }): WatchlistItem;
  removeWatchlistItem(id: string): void;
  clearAll(): void;
  exportBundle(): ProfileBundle;
  importBundle(raw: unknown): boolean;
  loadDemoProfile(): ProfileBundle;
  loadDemoInvestorProfile(): ProfileBundle;
}
