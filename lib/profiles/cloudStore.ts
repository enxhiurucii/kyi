"use client";

import { DEMO_INVESTORS } from "../presets";
import { createSupabaseBrowserClient } from "../supabase/browser";
import {
  assembleBundle,
  companyFromRow,
  companyToRow,
  founderFromRow,
  founderToRow,
  investorFromRow,
  investorToRow,
  listItemFromRow,
  watchlistFromRow,
  type CompanyRow,
  type FounderRow,
  type InvestorProfileRow,
  type ListItemRow,
  type ListRow,
  type WatchlistRow,
} from "./map";
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
} from "./types";

const ACTIVE_KEY = "kyi.cloud.activeListId";

function emptyBundle(): ProfileBundle {
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

function notify() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("kyi-profile-changed"));
  }
}

function nowIso() {
  return new Date().toISOString();
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function readActive(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function writeActive(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (id) window.localStorage.setItem(ACTIVE_KEY, id);
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

function ensureRole(roles: UserRole[], role: UserRole): UserRole[] {
  return roles.includes(role) ? roles : [...roles, role];
}

function demoFounderBundle(): ProfileBundle {
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

function demoInvestorBundle(): ProfileBundle {
  return {
    version: 1,
    roles: ["investor"],
    founder: null,
    company: null,
    investor: {
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
    },
    lists: [],
    activeListId: null,
    watchlist: [],
  };
}

/** In-memory + Supabase (RLS) implementation of ProfileStore. Sync API with async persist. */
export function createCloudStore(): ProfileStore & {
  hydrate(userId: string): Promise<ProfileBundle>;
  uploadBundle(userId: string, bundle: ProfileBundle): Promise<ProfileBundle>;
  deleteAccountData(userId: string): Promise<void>;
  getCache(): ProfileBundle;
} {
  let cache: ProfileBundle = emptyBundle();
  let userId: string | null = null;
  let persistChain: Promise<void> = Promise.resolve();

  function enqueue(job: () => Promise<void>) {
    persistChain = persistChain.then(job).catch((e) => {
      console.error("[kyi] cloud profile persist failed", e);
    });
  }

  function sb() {
    return createSupabaseBrowserClient();
  }

  async function ensureCompanyId(): Promise<string | null> {
    if (cache.company?.id) return cache.company.id;
    if (!userId || !cache.company) return null;
    const { data, error } = await sb()
      .from("companies")
      .upsert(companyToRow(userId, cache.company), { onConflict: "owner_id" })
      .select("*")
      .single();
    if (error || !data) throw error ?? new Error("company upsert failed");
    cache.company = companyFromRow(data as CompanyRow);
    return cache.company.id ?? null;
  }

  return {
    getCache() {
      return cache;
    },

    async hydrate(uid: string) {
      userId = uid;
      const client = sb();
      const [{ data: founderRow }, { data: companyRow }, { data: investorRow }, { data: watchRows }] = await Promise.all([
        client.from("founders").select("*").eq("id", uid).maybeSingle(),
        client.from("companies").select("*").eq("owner_id", uid).maybeSingle(),
        client.from("investor_profiles").select("*").eq("id", uid).maybeSingle(),
        client.from("watchlist_items").select("*").eq("user_id", uid).order("created_at"),
      ]);

      const founder = founderRow ? founderFromRow(founderRow as FounderRow) : null;
      const company = companyRow ? companyFromRow(companyRow as CompanyRow) : null;
      const investor = investorRow ? investorFromRow(investorRow as InvestorProfileRow) : null;
      const watchlist = ((watchRows ?? []) as WatchlistRow[]).map(watchlistFromRow);
      const lists: InvestorList[] = [];

      if (company?.id) {
        const { data: listRows } = await client.from("investor_lists").select("*").eq("company_id", company.id).order("created_at");
        const rows = (listRows ?? []) as ListRow[];
        for (const lr of rows) {
          const { data: items } = await client.from("list_items").select("*").eq("list_id", lr.id).order("created_at");
          lists.push({
            id: lr.id,
            name: lr.name,
            createdAt: lr.created_at,
            items: ((items ?? []) as ListItemRow[]).map(listItemFromRow),
          });
        }
      }

      const roles: UserRole[] = [];
      if (founder || company) roles.push("founder");
      if (investor) roles.push("investor");

      const active = readActive();
      const activeListId = active && lists.some((l) => l.id === active) ? active : lists[0]?.id ?? null;
      cache = assembleBundle(founder, company, lists, activeListId, { roles, investor, watchlist });
      notify();
      return cache;
    },

    async uploadBundle(uid: string, bundle: ProfileBundle) {
      userId = uid;
      cache = {
        version: 1,
        roles: bundle.roles ?? [],
        founder: bundle.founder ?? null,
        company: bundle.company ?? null,
        investor: bundle.investor ?? null,
        lists: Array.isArray(bundle.lists) ? bundle.lists : [],
        activeListId: bundle.activeListId ?? null,
        watchlist: Array.isArray(bundle.watchlist) ? bundle.watchlist : [],
      };
      if (bundle.founder) {
        await sb().from("founders").upsert(founderToRow(uid, bundle.founder), { onConflict: "id" });
      }
      if (bundle.company) {
        const { data } = await sb()
          .from("companies")
          .upsert(companyToRow(uid, { ...bundle.company, id: undefined }), { onConflict: "owner_id" })
          .select("*")
          .single();
        if (data) cache.company = companyFromRow(data as CompanyRow);
      }
      if (bundle.investor) {
        await sb().from("investor_profiles").upsert(investorToRow(uid, bundle.investor), { onConflict: "id" });
      }
      const companyId = cache.company?.id;
      if (companyId && bundle.lists.length) {
        await sb().from("investor_lists").delete().eq("company_id", companyId);
        for (const list of bundle.lists) {
          const { data: lr } = await sb()
            .from("investor_lists")
            .insert({ id: list.id, company_id: companyId, name: list.name, created_at: list.createdAt })
            .select("*")
            .single();
          const listId = (lr as ListRow | null)?.id ?? list.id;
          if (list.items.length) {
            await sb().from("list_items").insert(
              list.items.map((it) => ({
                id: it.id,
                list_id: listId,
                investor_name: it.investorName,
                investor_ref: it.investorRef,
                data_mode: it.dataMode,
                status: it.status,
                notes: it.notes ?? null,
                meeting_at: it.meetingAt ?? null,
                last_fit_score: it.lastFitScore ?? null,
                updated_at: it.updatedAt,
              })),
            );
          }
        }
      }
      if (bundle.watchlist?.length) {
        await sb().from("watchlist_items").delete().eq("user_id", uid);
        await sb().from("watchlist_items").insert(
          bundle.watchlist.map((w) => ({
            id: w.id,
            user_id: uid,
            company_ref: w.companyRef,
            company_name: w.companyName,
            data_mode: w.dataMode,
            note: w.note ?? null,
            created_at: w.createdAt,
          })),
        );
      }
      await this.hydrate(uid);
      return cache;
    },

    async deleteAccountData(uid: string) {
      userId = uid;
      await sb().from("watchlist_items").delete().eq("user_id", uid);
      await sb().from("investor_profiles").delete().eq("id", uid);
      await sb().from("companies").delete().eq("owner_id", uid);
      await sb().from("founders").delete().eq("id", uid);
      cache = emptyBundle();
      writeActive(null);
      notify();
    },

    getRoles() {
      return cache.roles;
    },
    setRoles(roles: UserRole[]) {
      cache = { ...cache, roles: [...new Set(roles)] };
      notify();
    },
    getFounder() {
      return cache.founder;
    },
    saveFounder(f: FounderProfile) {
      cache = {
        ...cache,
        founder: { ...f, updatedAt: nowIso() },
        roles: ensureRole(cache.roles, "founder"),
      };
      notify();
      if (!userId) return;
      const uid = userId;
      const payload = founderToRow(uid, cache.founder!);
      enqueue(async () => {
        const { error } = await sb().from("founders").upsert(payload, { onConflict: "id" });
        if (error) throw error;
      });
    },
    getCompany() {
      return cache.company;
    },
    saveCompany(c: CompanyProfile) {
      cache = {
        ...cache,
        company: { ...c, updatedAt: nowIso() },
        roles: ensureRole(cache.roles, "founder"),
      };
      notify();
      if (!userId) return;
      const uid = userId;
      enqueue(async () => {
        const { data, error } = await sb()
          .from("companies")
          .upsert(companyToRow(uid, cache.company!), { onConflict: "owner_id" })
          .select("*")
          .single();
        if (error) throw error;
        if (data) {
          cache = { ...cache, company: companyFromRow(data as CompanyRow) };
          notify();
        }
      });
    },
    getInvestor() {
      return cache.investor;
    },
    saveInvestor(inv: InvestorProfile) {
      cache = {
        ...cache,
        investor: { ...inv, updatedAt: nowIso() },
        roles: ensureRole(cache.roles, "investor"),
      };
      notify();
      if (!userId) return;
      const uid = userId;
      const payload = investorToRow(uid, cache.investor!);
      enqueue(async () => {
        const { error } = await sb().from("investor_profiles").upsert(payload, { onConflict: "id" });
        if (error) throw error;
      });
    },
    getLists() {
      return cache.lists;
    },
    getActiveListId() {
      return cache.activeListId;
    },
    setActiveListId(id: string | null) {
      cache = { ...cache, activeListId: id };
      writeActive(id);
      notify();
    },
    saveList(list: InvestorList) {
      const lists = [...cache.lists];
      const i = lists.findIndex((l) => l.id === list.id);
      if (i >= 0) lists[i] = list;
      else lists.push(list);
      const activeListId = cache.activeListId ?? list.id;
      cache = { ...cache, lists, activeListId };
      writeActive(activeListId);
      notify();
      if (!userId) return;
      enqueue(async () => {
        const companyId = await ensureCompanyId();
        if (!companyId) return;
        const { error } = await sb()
          .from("investor_lists")
          .upsert({ id: list.id, company_id: companyId, name: list.name, created_at: list.createdAt }, { onConflict: "id" });
        if (error) throw error;
        for (const it of list.items) {
          const { error: ie } = await sb().from("list_items").upsert(
            {
              id: it.id,
              list_id: list.id,
              investor_name: it.investorName,
              investor_ref: it.investorRef,
              data_mode: it.dataMode,
              status: it.status,
              notes: it.notes ?? null,
              meeting_at: it.meetingAt ?? null,
              last_fit_score: it.lastFitScore ?? null,
              updated_at: it.updatedAt,
            },
            { onConflict: "list_id,investor_ref" },
          );
          if (ie) throw ie;
        }
      });
    },
    deleteList(id: string) {
      const lists = cache.lists.filter((l) => l.id !== id);
      const activeListId = cache.activeListId === id ? lists[0]?.id ?? null : cache.activeListId;
      cache = { ...cache, lists, activeListId };
      writeActive(activeListId);
      notify();
      enqueue(async () => {
        const { error } = await sb().from("investor_lists").delete().eq("id", id);
        if (error) throw error;
      });
    },
    upsertItem(listId, item) {
      const lists = cache.lists.map((l) => ({ ...l, items: [...l.items] }));
      const list = lists.find((l) => l.id === listId);
      if (!list) return null;
      const existing = list.items.find((x) => x.investorRef === item.investorRef);
      const next: ListItem = {
        id: existing?.id ?? item.id ?? crypto.randomUUID(),
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
      cache = { ...cache, lists };
      notify();
      enqueue(async () => {
        const { error } = await sb().from("list_items").upsert(
          {
            id: next.id,
            list_id: listId,
            investor_name: next.investorName,
            investor_ref: next.investorRef,
            data_mode: next.dataMode,
            status: next.status,
            notes: next.notes ?? null,
            meeting_at: next.meetingAt ?? null,
            last_fit_score: next.lastFitScore ?? null,
            updated_at: next.updatedAt,
          },
          { onConflict: "list_id,investor_ref" },
        );
        if (error) throw error;
      });
      return next;
    },
    updateItem(listId, itemId, patch) {
      const lists = cache.lists.map((l) => ({ ...l, items: [...l.items] }));
      const list = lists.find((l) => l.id === listId);
      const item = list?.items.find((x) => x.id === itemId);
      if (!item) return null;
      Object.assign(item, patch, { updatedAt: nowIso() });
      cache = { ...cache, lists };
      notify();
      enqueue(async () => {
        const { error } = await sb()
          .from("list_items")
          .update({
            investor_name: item.investorName,
            investor_ref: item.investorRef,
            data_mode: item.dataMode,
            status: item.status,
            notes: item.notes ?? null,
            meeting_at: item.meetingAt ?? null,
            last_fit_score: item.lastFitScore ?? null,
            updated_at: item.updatedAt,
          })
          .eq("id", itemId);
        if (error) throw error;
      });
      return item;
    },
    removeItem(listId, itemId) {
      const lists = cache.lists.map((l) =>
        l.id === listId ? { ...l, items: l.items.filter((x) => x.id !== itemId) } : l,
      );
      cache = { ...cache, lists };
      notify();
      enqueue(async () => {
        const { error } = await sb().from("list_items").delete().eq("id", itemId);
        if (error) throw error;
      });
    },
    getWatchlist() {
      return cache.watchlist;
    },
    upsertWatchlistItem(item) {
      const existing = cache.watchlist.find((w) => w.companyRef === item.companyRef);
      const next: WatchlistItem = {
        id: existing?.id ?? item.id ?? uid(),
        companyRef: item.companyRef,
        companyName: item.companyName,
        dataMode: item.dataMode,
        note: item.note ?? existing?.note,
        createdAt: existing?.createdAt ?? item.createdAt ?? nowIso(),
      };
      const watchlist = existing
        ? cache.watchlist.map((w) => (w.id === existing.id ? next : w))
        : [...cache.watchlist, next];
      cache = { ...cache, watchlist };
      notify();
      if (!userId) return next;
      const ownerId = userId;
      enqueue(async () => {
        const { error } = await sb().from("watchlist_items").upsert(
          {
            id: next.id,
            user_id: ownerId,
            company_ref: next.companyRef,
            company_name: next.companyName,
            data_mode: next.dataMode,
            note: next.note ?? null,
            created_at: next.createdAt,
          },
          { onConflict: "user_id,company_ref" },
        );
        if (error) throw error;
      });
      return next;
    },
    removeWatchlistItem(id: string) {
      cache = { ...cache, watchlist: cache.watchlist.filter((w) => w.id !== id) };
      notify();
      enqueue(async () => {
        const { error } = await sb().from("watchlist_items").delete().eq("id", id);
        if (error) throw error;
      });
    },
    clearAll() {
      cache = emptyBundle();
      writeActive(null);
      notify();
      if (!userId) return;
      const uid = userId;
      enqueue(async () => {
        await sb().from("watchlist_items").delete().eq("user_id", uid);
        await sb().from("investor_profiles").delete().eq("id", uid);
        await sb().from("companies").delete().eq("owner_id", uid);
        await sb().from("founders").delete().eq("id", uid);
      });
    },
    exportBundle() {
      return cache;
    },
    importBundle(raw: unknown) {
      try {
        if (!raw || typeof raw !== "object") return false;
        const o = raw as Partial<ProfileBundle>;
        if (o.version !== 1) return false;
        const roles = Array.isArray(o.roles)
          ? (o.roles.filter((r) => r === "founder" || r === "investor") as UserRole[])
          : o.founder || o.company
            ? (["founder"] as UserRole[])
            : o.investor
              ? (["investor"] as UserRole[])
              : [];
        cache = {
          version: 1,
          roles,
          founder: o.founder ?? null,
          company: o.company ?? null,
          investor: o.investor ?? null,
          lists: Array.isArray(o.lists) ? o.lists : [],
          activeListId: typeof o.activeListId === "string" ? o.activeListId : null,
          watchlist: Array.isArray(o.watchlist) ? o.watchlist : [],
        };
        notify();
        if (userId) {
          const uid = userId;
          enqueue(async () => {
            await this.uploadBundle(uid, cache);
          });
        }
        return true;
      } catch {
        return false;
      }
    },
    loadDemoProfile() {
      cache = demoFounderBundle();
      notify();
      if (userId) {
        const uid = userId;
        enqueue(async () => {
          await this.uploadBundle(uid, cache);
        });
      }
      return cache;
    },
    loadDemoInvestorProfile() {
      cache = demoInvestorBundle();
      notify();
      if (userId) {
        const uid = userId;
        enqueue(async () => {
          await this.uploadBundle(uid, cache);
        });
      }
      return cache;
    },
  };
}
