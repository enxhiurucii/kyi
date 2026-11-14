"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getJSON, marketHref } from "@/lib/client";
import { profileStore, subscribeProfile } from "@/lib/profileStore";
import { SECTOR_KEYWORDS } from "@/lib/similarity";
import type { Thesis, ThesisRegion } from "@/lib/types";
import { STAGE_LABEL, STAGE_ORDER, type DataMode, type Stage } from "@/lib/types";
import { btn, Card, Chip, cx, field, FitPage, Label, ModeBadge } from "./ui";

const SECTORS = Object.keys(SECTOR_KEYWORDS);
const REGIONS: ThesisRegion[] = ["Nordics", "Baltics", "DACH", "Europe", "Global"];

const MIKKO_THESIS: Thesis = {
  sectors: ["logistics", "mobility"],
  stages: ["pre-seed", "seed"],
  regions: ["Nordics", "Baltics"],
  ticketMinEur: 500_000,
  ticketMaxEur: 3_000_000,
};

function sectorLabel(key: string) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function toggleIn<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function thesisFromProfile(): Thesis {
  const inv = profileStore.getInvestor();
  if (inv) {
    return {
      sectors: inv.thesisSectors,
      stages: inv.thesisStages,
      regions: inv.thesisRegions,
      ticketMinEur: inv.ticketMinEur,
      ticketMaxEur: inv.ticketMaxEur,
    };
  }
  return MIKKO_THESIS;
}

function applyThesisToForm(t: Thesis) {
  return {
    sectors: t.sectors,
    stages: t.stages,
    regions: t.regions,
    ticketMin: t.ticketMinEur != null ? String(t.ticketMinEur) : "",
    ticketMax: t.ticketMaxEur != null ? String(t.ticketMaxEur) : "",
  };
}

type Health = { defaultMode: DataMode; calaConfigured: boolean; aiEnabled?: boolean };

export default function InvestView() {
  const router = useRouter();
  const demoDone = useRef(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [sectors, setSectors] = useState<string[]>(() => thesisFromProfile().sectors);
  const [stages, setStages] = useState<Stage[]>(() => thesisFromProfile().stages);
  const [regions, setRegions] = useState<ThesisRegion[]>(() => thesisFromProfile().regions);
  const [ticketMin, setTicketMin] = useState(() => {
    const t = thesisFromProfile().ticketMinEur;
    return t != null ? String(t) : "500000";
  });
  const [ticketMax, setTicketMax] = useState(() => {
    const t = thesisFromProfile().ticketMaxEur;
    return t != null ? String(t) : "3000000";
  });
  const [mode, setMode] = useState<DataMode>("demo");
  const [error, setError] = useState("");
  const [investorName, setInvestorName] = useState(() => profileStore.getInvestor()?.fullName ?? "");

  useEffect(() => {
    const sync = () => {
      const t = thesisFromProfile();
      setSectors(t.sectors);
      setStages(t.stages);
      setRegions(t.regions);
      setTicketMin(t.ticketMinEur != null ? String(t.ticketMinEur) : "");
      setTicketMax(t.ticketMaxEur != null ? String(t.ticketMaxEur) : "");
      setInvestorName(profileStore.getInvestor()?.fullName ?? "");
    };
    sync();
    return subscribeProfile(sync);
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    getJSON<Health>("/api/health", ac.signal)
      .then((h) => {
        setMode(h.defaultMode);
        setAiEnabled(h.aiEnabled !== false);
      })
      .catch(() => undefined);
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (demoDone.current) return;
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("demo") !== "1") return;
    demoDone.current = true;
    queueMicrotask(() => {
      profileStore.loadDemoInvestorProfile();
      const f = applyThesisToForm(MIKKO_THESIS);
      setSectors(f.sectors);
      setStages(f.stages);
      setRegions(f.regions);
      setTicketMin(f.ticketMin);
      setTicketMax(f.ticketMax);
      setMode("demo");
      setInvestorName("Mikko");
    });
  }, []);

  function openRadar() {
    setError("");
    if (!sectors.length) {
      setError("Pick at least one sector.");
      return;
    }
    const thesis: Thesis = {
      sectors,
      stages,
      regions,
      ticketMinEur: ticketMin.trim() ? Number(ticketMin) : undefined,
      ticketMaxEur: ticketMax.trim() ? Number(ticketMax) : undefined,
    };
    const existing = profileStore.getInvestor();
    profileStore.saveInvestor({
      fullName: existing?.fullName || investorName || "Investor",
      firmName: existing?.firmName,
      calaFirmId: existing?.calaFirmId,
      roleTitle: existing?.roleTitle,
      thesisSectors: thesis.sectors,
      thesisStages: thesis.stages,
      thesisRegions: thesis.regions,
      ticketMinEur: thesis.ticketMinEur,
      ticketMaxEur: thesis.ticketMaxEur,
      confirmedFirm: existing?.confirmedFirm ?? false,
      updatedAt: new Date().toISOString(),
    });
    router.push(marketHref(thesis, mode));
  }

  return (
    <FitPage className="fit:justify-center">
      <div className="mx-auto w-full max-w-2xl fit:max-w-xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">Invest</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight fit:text-xl">Your investment thesis</h1>
          </div>
          <ModeBadge mode={mode} />
        </div>
        <p className="mt-2 text-sm text-ink-2 fit:mt-1 fit:text-xs">
          {investorName ? (
            <>
              Prefills from <span className="font-medium text-ink">{investorName}</span>. Open Market Radar to see where money
              flows and who raises next.
            </>
          ) : (
            <>Set sectors, stages and regions — then open Market Radar.</>
          )}
        </p>

        <Card className="mt-8 space-y-6 p-5 sm:p-6 fit:mt-4 fit:space-y-4 fit:p-4">
          <div>
            <Label>Sectors</Label>
            <div className="mt-2 flex flex-wrap gap-2 fit:gap-1.5">
              {SECTORS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={cx(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition fit:px-2.5 fit:py-1",
                    sectors.includes(s) ? "bg-white text-black" : "bg-white/5 text-muted hover:text-ink",
                  )}
                  onClick={() => setSectors((xs) => toggleIn(xs, s))}
                >
                  {sectorLabel(s)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Stages</Label>
            <div className="mt-2 flex flex-wrap gap-2 fit:gap-1.5">
              {STAGE_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={cx(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition fit:px-2.5 fit:py-1",
                    stages.includes(s) ? "bg-white text-black" : "bg-white/5 text-muted hover:text-ink",
                  )}
                  onClick={() => setStages((xs) => toggleIn(xs, s))}
                >
                  {STAGE_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Regions</Label>
            <div className="mt-2 flex flex-wrap gap-2 fit:gap-1.5">
              {REGIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={cx(
                    "rounded-full px-3 py-1.5 text-xs font-medium transition fit:px-2.5 fit:py-1",
                    regions.includes(r) ? "bg-white text-black" : "bg-white/5 text-muted hover:text-ink",
                  )}
                  onClick={() => setRegions((xs) => toggleIn(xs, r))}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 fit:gap-3">
            <div>
              <Label>Ticket min €</Label>
              <input className={`${field} mt-1.5`} inputMode="numeric" value={ticketMin} onChange={(e) => setTicketMin(e.target.value)} />
            </div>
            <div>
              <Label>Ticket max €</Label>
              <input className={`${field} mt-1.5`} inputMode="numeric" value={ticketMax} onChange={(e) => setTicketMax(e.target.value)} />
            </div>
          </div>

          {error ? <p className="text-sm text-bad">{error}</p> : null}

          <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between fit:pt-3">
            {aiEnabled ? (
              <Link href="/scout?for=investor" className="text-sm text-accent hover:underline fit:text-xs">
                Let the agent find startups for me →
              </Link>
            ) : (
              <span />
            )}
            <button type="button" className={btn.primary} onClick={openRadar}>
              Open Market Radar →
            </button>
          </div>
        </Card>

        <p className="mt-6 text-xs text-muted fit:mt-3 fit:hidden">
          Looking for a single company?{" "}
          <Link href="/incoming" className="text-accent hover:underline">
            Diligence a name
          </Link>
          {sectors.length ? (
            <>
              {" "}
              · thesis: {sectors.map(sectorLabel).join(", ")}
              {stages.length ? ` · ${stages.map((s) => STAGE_LABEL[s]).join(", ")}` : ""}
              {regions.length ? ` · ${regions.join(", ")}` : ""}
            </>
          ) : null}
        </p>
        {investorName ? (
          <p className="mt-2 fit:hidden">
            <Chip tone="neutral">Signed in as {investorName}</Chip>
          </p>
        ) : null}
      </div>
    </FitPage>
  );
}