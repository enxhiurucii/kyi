"use client";

import { DEMO_INVESTORS } from "./presets";
import { createCloudStore } from "./profiles/cloudStore";
import type {
  CompanyProfile,
  FounderProfile,
  InvestorList,
  InvestorProfile,
  ListItem,
  ListItemStatus,
  ProfileBundle,
  ProfileStore,
  UserRole,
  WatchlistItem,
} from "./profiles/types";

const KEY = "kyi.profile.v1";

type Stored = ProfileBundle;

function emptyBundle(): Stored {
  return {
    version: 1,
    roles: [],
    founder: null,
    company: null,
    investor: null,
    lists: [],
    activeListId: null,
    watchlist: [],
  };
}

function normalizeBundle(parsed: Partial<Stored> | null | undefined): Stored {
  if (!parsed || parsed.version !== 1) return emptyBundle();
  let roles = Array.isArray(parsed.roles)
    ? (parsed.roles.filter((r) => r === "founder" || r === "investor") as UserRole[])
    : [];
  if (roles.length === 0) {
    if (parsed.founder || parsed.company) roles = ["founder"];
    else if (parsed.investor) roles = ["investor"];
  }
  if ((parsed.founder || parsed.company) && !roles.includes("founder")) roles = [...roles, "founder"];
  if (parsed.investor && !roles.includes("investor")) roles = [...roles, "investor"];
  return {
    version: 1,
    roles,
    founder: parsed.founder ?? null,
    company: parsed.company ?? null,
    investor: parsed.investor ?? null,
    lists: Array.isArray(parsed.lists) ? parsed.lists : [],
    activeListId: typeof parsed.activeListId === "string" ? parsed.activeListId : null,
    watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
  };
}

function read(): Stored {
  if (typeof window === "undefined") return emptyBundle();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyBundle();
    return normalizeBundle(JSON.parse(raw) as Partial<Stored>);
  } catch {
    return emptyBundle();
  }
}

function write(bundle: Stored): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(bundle));
    window.dispatchEvent(new CustomEvent("kyi-profile-changed"));
  } catch {
    // Private mode / quota — fail soft.
  }
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function demoFounderBundle(): Stored {
  const founder: FounderProfile = {
    fullName: "Anna",
    role: "CEO & co-founder",
    location: "Helsinki, Finland",
    pastCompanies: [{ name: "Kuura Cargo" }, { name: "Lastu Robotics" }],
    schools: [{ name: "Aalto University" }],
    confirmedIdentity: true,
    updatedAt: nowIso(),
  };
  const company: CompanyProfile = {
    name: "Lumipolku Logistics (demo)",
    oneLiner: "AI route planning for trucking fleets — cuts empty kilometres and fuel costs",
    stage: "seed",
    country: "Finland",
    sectors: ["logistics"],
    raisingAmountEur: 2_500_000,
    existingInvestors: [{ name: "Revontuli Angels" }, { name: "Kettu Ventures" }],
    discoverable: true,
    updatedAt: nowIso(),
  };

  const statuses: ListItemStatus[] = [
    "to_contact",
    "meeting_booked",
    "to_contact",
    "to_contact",
    "to_contact",
    "to_contact",
    "to_contact",
    "meeting_booked",
    "passed",
    "to_contact",
    "to_contact",
    "to_contact",
  ];
  const listId = uid();
  const list: InvestorList = {
    id: listId,
    name: "Slush meetings",
    createdAt: nowIso(),
    items: DEMO_INVESTORS.map((name, i) => ({
      id: uid(),
      investorName: name,
      investorRef: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      dataMode: "demo" as const,
      status: statuses[i] ?? "to_contact",
      updatedAt: nowIso(),
    })),
  };

  return {
    version: 1,
    roles: ["founder"],
    founder,
    company,
    investor: null,
    lists: [list],
    activeListId: listId,
    watchlist: [],
  };
}

function demoInvestorBundle(): Stored {
  const investor: InvestorProfile = {
    fullName: "Mikko",
    firmName: "Sisu Seed Partners",
    calaFirmId: "sisu-seed-partners",
    roleTitle: "Partner",
    thesisSectors: ["logistics", "mobility"],
    thesisStages: ["pre-seed", "seed"],
    thesisRegions: ["Nordics", "Baltics"],
    ticketMinEur: 500_000,
    ticketMaxEur: 3_000_000,
    confirmedFirm: true,
    updatedAt: nowIso(),
  };
  return {
    version: 1,
    roles: ["investor"],
    founder: null,
    company: null,
    investor,
    lists: [],
    activeListId: null,
    watchlist: [],
  };
}

export function createLocalStore(): ProfileStore {
  return {
    getRoles() {
      return read().roles;
    },
    setRoles(roles) {
      const b = read();
      b.roles = [...new Set(roles)];
      write(b);
    },
    getFounder() {
      return read().founder;
    },
    saveFounder(f) {
      const b = read();
      b.founder = { ...f, updatedAt: nowIso() };
      if (!b.roles.includes("founder")) b.roles = [...b.roles, "founder"];
      write(b);
    },
    getCompany() {
      return read().company;
    },
    saveCompany(c) {
      const b = read();
      b.company = { ...c, updatedAt: nowIso() };
      if (!b.roles.includes("founder")) b.roles = [...b.roles, "founder"];
      write(b);
    },
    getInvestor() {
      return read().investor;
    },
    saveInvestor(inv) {
      const b = read();
      b.investor = { ...inv, updatedAt: nowIso() };
      if (!b.roles.includes("investor")) b.roles = [...b.roles, "investor"];
      write(b);
    },
    getLists() {
      return read().lists;
    },
    getActiveListId() {
      return read().activeListId;
    },
    setActiveListId(id) {
      const b = read();
      b.activeListId = id;
      write(b);
    },
    saveList(list) {
      const b = read();
      const i = b.lists.findIndex((l) => l.id === list.id);
      if (i >= 0) b.lists[i] = list;
      else b.lists.push(list);
      if (!b.activeListId) b.activeListId = list.id;
      write(b);
    },
    deleteList(id) {
      const b = read();
      b.lists = b.lists.filter((l) => l.id !== id);
      if (b.activeListId === id) b.activeListId = b.lists[0]?.id ?? null;
      write(b);
    },
    upsertItem(listId, item) {
      const b = read();
      const list = b.lists.find((l) => l.id === listId);
      if (!list) return null;
      const existing = list.items.find((x) => x.investorRef === item.investorRef);
      const next: ListItem = {
        id: existing?.id ?? item.id ?? uid(),
        investorName: item.investorName,
        investorRef: item.investorRef,
        dataMode: item.dataMode,
        status: item.status ?? existing?.status ?? "to_contact",
        notes: item.notes ?? existing?.notes,
        meetingAt: item.meetingAt ?? existing?.meetingAt,
        lastFitScore: item.lastFitScore ?? existing?.lastFitScore,
        updatedAt: nowIso(),
      };
      if (existing) Object.assign(existing, next);
      else list.items.push(next);
      write(b);
      return next;
    },
    updateItem(listId, itemId, patch) {
      const b = read();
      const list = b.lists.find((l) => l.id === listId);
      const item = list?.items.find((x) => x.id === itemId);
      if (!item) return null;
      Object.assign(item, patch, { updatedAt: nowIso() });
      write(b);
      return item;
    },
    removeItem(listId, itemId) {
      const b = read();
      const list = b.lists.find((l) => l.id === listId);
      if (!list) return;
      list.items = list.items.filter((x) => x.id !== itemId);
      write(b);
    },
    getWatchlist() {
      return read().watchlist;
    },
    upsertWatchlistItem(item) {
      const b = read();
      const existing = b.watchlist.find((w) => w.companyRef === item.companyRef);
      const next: WatchlistItem = {
        id: existing?.id ?? item.id ?? uid(),
        companyRef: item.companyRef,
        companyName: item.companyName,
        dataMode: item.dataMode,
        note: item.note ?? existing?.note,
        createdAt: existing?.createdAt ?? item.createdAt ?? nowIso(),
      };
      if (existing) Object.assign(existing, next);
      else b.watchlist.push(next);
      write(b);
      return next;
    },
    removeWatchlistItem(id) {
      const b = read();
      b.watchlist = b.watchlist.filter((w) => w.id !== id);
      write(b);
    },
    clearAll() {
      write(emptyBundle());
    },
    exportBundle() {
      return read();
    },
    importBundle(raw) {
      try {
        if (!raw || typeof raw !== "object") return false;
        const next = normalizeBundle(raw as Partial<Stored>);
        write(next);
        return true;
      } catch {
        return false;
      }
    },
    loadDemoProfile() {
      const demo = demoFounderBundle();
      write(demo);
      return demo;
    },
    loadDemoInvestorProfile() {
      const demo = demoInvestorBundle();
      write(demo);
      return demo;
    },
  };
}

const localStore = createLocalStore();
const cloudStore = typeof window !== "undefined" ? createCloudStore() : null;

type Backend = "local" | "cloud";
let backend: Backend = "local";

function active(): ProfileStore {
  if (backend === "cloud" && cloudStore) return cloudStore;
  return localStore;
}

/** Facade: localStorage when signed out; Supabase-backed cache when signed in. */
export const profileStore: ProfileStore = {
  getRoles: () => active().getRoles(),
  setRoles: (r) => active().setRoles(r),
  getFounder: () => active().getFounder(),
  saveFounder: (f) => active().saveFounder(f),
  getCompany: () => active().getCompany(),
  saveCompany: (c) => active().saveCompany(c),
  getInvestor: () => active().getInvestor(),
  saveInvestor: (inv) => active().saveInvestor(inv),
  getLists: () => active().getLists(),
  getActiveListId: () => active().getActiveListId(),
  setActiveListId: (id) => active().setActiveListId(id),
  saveList: (list) => active().saveList(list),
  deleteList: (id) => active().deleteList(id),
  upsertItem: (listId, item) => active().upsertItem(listId, item),
  updateItem: (listId, itemId, patch) => active().updateItem(listId, itemId, patch),
  removeItem: (listId, itemId) => active().removeItem(listId, itemId),
  getWatchlist: () => active().getWatchlist(),
  upsertWatchlistItem: (item) => active().upsertWatchlistItem(item),
  removeWatchlistItem: (id) => active().removeWatchlistItem(id),
  clearAll: () => active().clearAll(),
  exportBundle: () => active().exportBundle(),
  importBundle: (raw) => active().importBundle(raw),
  loadDemoProfile: () => active().loadDemoProfile(),
  loadDemoInvestorProfile: () => active().loadDemoInvestorProfile(),
};

export function peekLocalBundle(): ProfileBundle {
  return localStore.exportBundle();
}

export function clearLocalBundle(): void {
  localStore.clearAll();
}

export function localHasProfile(): boolean {
  const b = localStore.exportBundle();
  return Boolean(b.founder || b.company || b.investor || b.lists.length || b.roles.length);
}

export async function switchToCloudProfile(userId: string): Promise<ProfileBundle> {
  if (!cloudStore) throw new Error("Cloud store unavailable");
  const bundle = await cloudStore.hydrate(userId);
  backend = "cloud";
  window.dispatchEvent(new CustomEvent("kyi-profile-changed"));
  return bundle;
}

export async function uploadLocalToCloud(userId: string): Promise<ProfileBundle> {
  if (!cloudStore) throw new Error("Cloud store unavailable");
  const local = localStore.exportBundle();
  const bundle = await cloudStore.uploadBundle(userId, local);
  backend = "cloud";
  localStore.clearAll();
  window.dispatchEvent(new CustomEvent("kyi-profile-changed"));
  return bundle;
}

export function switchToLocalProfile(): void {
  backend = "local";
  window.dispatchEvent(new CustomEvent("kyi-profile-changed"));
}

export function isCloudProfile(): boolean {
  return backend === "cloud";
}

export async function deleteCloudAccountData(userId: string): Promise<void> {
  if (!cloudStore) return;
  await cloudStore.deleteAccountData(userId);
  backend = "local";
  window.dispatchEvent(new CustomEvent("kyi-profile-changed"));
}

export function subscribeProfile(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => onChange();
  window.addEventListener("kyi-profile-changed", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("kyi-profile-changed", handler);
    window.removeEventListener("storage", handler);
  };
}

export function companyToStartup(c: CompanyProfile | null): { description: string; stage: CompanyProfile["stage"]; country: string } | null {
  if (!c?.oneLiner?.trim()) return null;
  return { description: c.oneLiner, stage: c.stage, country: c.country || "" };
}

export { isVerifiedFounder } from "./auth/verify";
