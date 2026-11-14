import type { Stage } from "../types";

/** Client + API shape for an expressed interest. */
export type InterestRecord = {
  id: string;
  /** Stable key: Supabase company uuid, or demo company id / slug. */
  companyId: string;
  companyName: string;
  /** Raising stage shown on KYI badge at time of interest (optional). */
  companyStage?: Stage;
  investorUserId: string;
  investorName: string;
  investorFirm: string;
  message?: string;
  createdAt: string;
  /** demo | cloud */
  source: "demo" | "cloud";
};

export type IncomingInterest = InterestRecord & {
  fitScore: number | null;
  thesisFitScore: number | null;
  mutualMatch: boolean;
  reportHref: string;
};

export const DEMO_LUMIPOLKU_NAME = "Lumipolku Logistics (demo)";
export const DEMO_SISU_FIRM = "Sisu Seed Partners";
export const DEMO_MIKKO_ID = "demo-investor-mikko";
export const DEMO_ANNA_COMPANY_ID = "demo-company-lumipolku";
