"use client";

import { normName } from "../format";
import {
  DEMO_ANNA_COMPANY_ID,
  DEMO_LUMIPOLKU_NAME,
  DEMO_MIKKO_ID,
  DEMO_SISU_FIRM,
  type InterestRecord,
} from "./types";
import type { Stage } from "../types";

const KEY = "kyi.interests.v1";
const EVENT = "kyi-interests-changed";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `int-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function read(): InterestRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is InterestRecord => !!x && typeof x === "object" && typeof (x as InterestRecord).id === "string");
  } catch {
    return [];
  }
}

function write(rows: InterestRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore */
  }
}

export function subscribeInterests(fn: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => fn();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function listLocalInterests(): InterestRecord[] {
  return read();
}

export function listIncomingForCompany(companyName: string, companyId?: string | null): InterestRecord[] {
  const n = normName(companyName);
  return read().filter(
    (r) =>
      (companyId && r.companyId === companyId) ||
      normName(r.companyName) === n ||
      (n.includes("lumipolku") && normName(r.companyName).includes("lumipolku")),
  );
}

export function hasLocalInterest(investorUserId: string, companyName: string, companyId?: string): boolean {
  const n = normName(companyName);
  return read().some(
    (r) =>
      r.investorUserId === investorUserId &&
      ((companyId && r.companyId === companyId) || normName(r.companyName) === n),
  );
}

export function expressLocalInterest(input: {
  companyId?: string;
  companyName: string;
  companyStage?: Stage;
  investorUserId: string;
  investorName: string;
  investorFirm: string;
  message?: string;
}): InterestRecord {
  const rows = read();
  const companyId = input.companyId?.trim() || demoCompanyIdFor(input.companyName);
  const existing = rows.find(
    (r) => r.investorUserId === input.investorUserId && (r.companyId === companyId || normName(r.companyName) === normName(input.companyName)),
  );
  if (existing) {
    const next: InterestRecord = {
      ...existing,
      message: input.message?.trim() || existing.message,
      companyStage: input.companyStage ?? existing.companyStage,
      companyName: input.companyName,
    };
    write(rows.map((r) => (r.id === existing.id ? next : r)));
    return next;
  }
  const row: InterestRecord = {
    id: uid(),
    companyId,
    companyName: input.companyName,
    companyStage: input.companyStage,
    investorUserId: input.investorUserId,
    investorName: input.investorName,
    investorFirm: input.investorFirm || DEMO_SISU_FIRM,
    message: input.message?.trim() || undefined,
    createdAt: new Date().toISOString(),
    source: "demo",
  };
  write([...rows, row]);
  return row;
}

export function removeLocalInterest(id: string) {
  write(read().filter((r) => r.id !== id));
}

function demoCompanyIdFor(name: string): string {
  if (/lumipolku/i.test(name)) return DEMO_ANNA_COMPANY_ID;
  return `demo-${normName(name).replace(/\s+/g, "-").slice(0, 48)}`;
}

/** Stable demo investor id for Mikko persona. */
export function demoInvestorUserId(): string {
  return DEMO_MIKKO_ID;
}

export function isDemoLumipolku(name: string): boolean {
  return normName(name) === normName(DEMO_LUMIPOLKU_NAME) || /lumipolku/i.test(name);
}
