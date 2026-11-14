import type { DataMode, Startup } from "../types";

export const SCOUT_HANDOFF_KEY = "kyi.scout.handoff.v1";

export type ScoutHandoff = {
  investors: string[];
  startup: Startup;
  mode: DataMode;
  autoRank: boolean;
};
