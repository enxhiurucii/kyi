// Presets for the demo button (client-safe: no server imports).
import type { Startup } from "./types";

export const DEMO_STARTUP: Startup = {
  description: "AI route planning for trucking fleets — cuts empty kilometres and fuel costs",
  stage: "seed",
  country: "Finland",
};

/** Fictional investors from the synthetic demo dataset */
export const DEMO_INVESTORS = [
  "Aurora Peak Capital",
  "Sisu Seed Partners",
  "Lumo Ventures",
  "Kide Capital",
  "Pohjola Growth Partners",
  "Revontuli Angels",
  "Amber Coast VC",
  "Arctic Loop Capital",
  "Kettu Ventures",
  "Glacier Deep Tech",
  "Øresund Crest Ventures",
  "Saimaa Seed",
];

/** Real Nordic investors to try in live (Cala) mode — names only, no claims. */
export const LIVE_SAMPLE_INVESTORS = [
  "Lifeline Ventures",
  "Maki.vc",
  "Inventure",
  "Icebreaker.vc",
  "Voima Ventures",
  "byFounders",
  "Creandum",
  "Northzone",
];

export const LIVE_SAMPLE_COMPANIES = ["Wolt", "Aiven", "Oura", "Iceye", "Relex"];
export const LIVE_SAMPLE_FUND = "Lifeline Ventures";
