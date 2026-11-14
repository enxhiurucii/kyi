import type { CompanyProfile, FounderProfile } from "../profiles/types";

export type AuthUserSummary = {
  id: string;
  email: string | null;
  fullName: string | null;
  isAnonymous: boolean;
};

export type MeResponse = {
  accountsEnabled: boolean;
  user: AuthUserSummary | null;
  founder: FounderProfile | null;
  company: CompanyProfile | null;
  verifiedFounder: boolean;
};
