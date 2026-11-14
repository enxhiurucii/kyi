"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  companyHref,
  investorReportHref,
  modeFromParams,
  postJSON,
  thesisFromParams,
} from "@/lib/client";
import { fmtEur, fmtMonthYear, fmtMonthsAgo } from "@/lib/format";
import { profileStore } from "@/lib/profileStore";
import type { MarketReport, Round, Thesis } from "@/lib/types";
import { STAGE_LABEL, type DataMode } from "@/lib/types";
import ExpressInterest, { isDiscoverableOnKyi, OnKyiBadge } from "./ExpressInterest";
import EvidenceDrawer, { type Evidence } from "./EvidenceDrawer";
import { btn, Card, Chip, cx, FitPage, Label, ModeBadge, ScoreRing, Spinner } from "./ui";

const MIKKO_THESIS: Thesis = {
  sectors: ["logistics", "mobility"],
  stages: ["pre-seed", "seed"],
  regions: ["Nordics", "Baltics"],
  ticketMinEur: 500_000,
  ticketMaxEur: 3_000_000,
};

function DataNotesHint({ warnings }: { warnings: string[] }) {
  const title = warnings.length ? warnings.join(" · ") : "No data gaps flagged.";
  return (
    <button
      type="button"
      className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-[10px] font-semibold text-muted fit:inline-flex"
      title={title}
      aria-label="Data notes"
    >
      i
    </button>
  );
}

function sectorLabel(key: string) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function thesisFromInvestor(): Thesis | null {
  const inv = profileStore.getInvestor();
  if (!inv?.thesisSectors.length && !inv?.thesisStages.length && !inv?.thesisRegions.length) return null;
  return {
    sectors: inv.thesisSectors,
    stages: inv.thesisStages,
    regions: inv.thesisRegions,
    ticketMinEur: inv.ticketMinEur,
    ticketMaxEur: inv.ticketMaxEur,
  };
}


function FundingQuarterChart({ data }: { data: MarketReport["quarterly"] }) {
  if (!data.length) return <p className="text-sm text-muted">No quarterly data.</p>;
  const maxDeals = Math.max(1, ...data.map((d) => d.deals));
  const maxRaised = Math.max(1, ...data.map((d) => d.raisedEur));
  const height = 88;
  const w = 100 / data.length;
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
        {data.map((d, i) => {
          const hDeals = (d.deals / maxDeals) * (height - 4);
          const hRaised = (d.raisedEur / maxRaised) * (height - 4) * 0.55;
          return (
            <g key={d.quarter}>
              <rect x={i * w + w * 0.12} y={height - hDeals} width={w * 0.35} height={hDeals} rx={0.6} fill="var(--chart-2)" />
              <rect x={i * w + w * 0.5} y={height - hRaised} width={w * 0.35} height={hRaised} rx={0.6} fill="var(--chart-1)" />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted">
        <span>{data[0]?.quarter.replace("-", " ")}</span>
        <span className="flex gap-3">
          <span>
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-sm" style={{ background: "var(--chart-2)" }} />
            Deals
          </span>
          <span>
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-sm" style={{ background: "var(--chart-1)" }} />€ raised
          </span>
        </span>
        <span>{data[data.length - 1]?.quarter.replace("-", " ")}</span>
      </div>
    </div>
  );
}

export default function MarketView() {
  const sp = useSearchParams();
  const thesis = useMemo(() => {
    const fromParams = thesisFromParams(sp);
    if (fromParams) return fromParams;
    const fromInvestor = thesisFromInvestor();
    if (fromInvestor) return fromInvestor;
    if (sp.get("demo") === "1") return MIKKO_THESIS;
    return null;
  }, [sp]);
  const modeHint = modeFromParams(sp);
  const [report, setReport] = useState<MarketReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const closeEvidence = useCallback(() => setEvidence(null), []);

  const key = thesis
    ? `${thesis.sectors.join("|")}|${thesis.stages.join("|")}|${thesis.regions.join("|")}|${thesis.ticketMinEur}|${thesis.ticketMaxEur}|${modeHint ?? ""}`
    : "";

  useEffect(() => {
    if (!thesis) return;
    const ac = new AbortController();
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    void (async () => {
      await Promise.resolve();
      if (ac.signal.aborted) return;
      setLoading(true);
      setError("");
      setReport(null);
      setElapsed(0);
      try {
        const r = await postJSON<MarketReport>("/api/market", { thesis, mode: modeHint }, ac.signal);
        if (!ac.signal.aborted) {
          setReport(r);
          setLoading(false);
        }
      } catch (e) {
        if (ac.signal.aborted) return;
        setError(e instanceof ApiError ? e.message : (e as Error).message || "Market request failed.");
        setLoading(false);
      } finally {
        clearInterval(tick);
      }
    })();
    return () => {
      ac.abort();
      clearInterval(tick);
    };
  }, [key, thesis, modeHint]);

  function openRound(r: Round) {
    setEvidence({
      title: r.companyName,
      subtitle: `${r.stageLabel}${r.date ? ` · ${fmtMonthYear(r.date)}` : ""}${r.amountLabel ? ` · ${r.amountLabel}` : ""}`,
      groups: [{ title: "", rounds: [r] }],
    });
  }

  function watchCompany(name: string, ref: string, dataMode: DataMode) {
    profileStore.upsertWatchlistItem({
      companyRef: ref,
      companyName: name,
      dataMode,
      note: "From Market Radar",
    });
  }

  if (!thesis) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Market Radar</h1>
        <p className="mt-2 text-sm text-muted">Set a thesis first — sectors, stages and regions.</p>
        <Link href="/invest" className={`${btn.primary} mt-6`}>
          Set thesis →
        </Link>
      </div>
    );
  }

  if (loading || (!report && !error)) {
    const live = modeHint !== "demo";
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6" aria-live="polite">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">{live ? "Live" : "Demo"}</p>
        <h1 className="mt-3 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Spinner className="text-accent" />
          {live ? "Reading Cala’s graph" : "Building the radar"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {live
            ? "First time takes a minute, then cached. Sector queries + company confirms…"
            : "Scoring the demo market sample…"}
          {elapsed > 0 ? ` ${elapsed}s` : ""}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-bad/30 bg-bad-soft p-5 text-sm text-bad">{error}</div>
        <Link href="/invest" className={`${btn.secondary} mt-6`}>
          ← Edit thesis
        </Link>
      </div>
    );
  }

  const r = report!;
  const topLead = r.topLeads[0] ?? null;
  const roundsById = Object.fromEntries(r.recentRounds.map((x) => [x.id, x]));
  for (const w of r.toWatch) roundsById[w.lastRound.id] = w.lastRound;

  function renderWatchRow(row: (typeof r.toWatch)[number], watchIdx: number, compact?: boolean) {
    const lead = row.lastRound.investors.find((p) => p.isLead === true);
    const onKyi = isDiscoverableOnKyi(row.company.name, r.dataMode);
    return (
      <Card
        key={row.company.id}
        className={cx("p-4 sm:p-5", compact && "p-3")}
        data-testid={
          /lumipolku/i.test(row.company.name)
            ? "watch-lumipolku"
            : watchIdx === 0
              ? "watch-first"
              : "watch-row"
        }
      >
        <div className="flex flex-wrap items-start gap-4 fit:gap-2">
          <ScoreRing score={row.score} size={compact ? 48 : 64} label="Raise-soon" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={cx("font-semibold tracking-tight", compact ? "text-sm" : "text-lg")}>{row.company.name}</h3>
              {onKyi ? <OnKyiBadge stage={onKyi.stage} /> : null}
              {row.company.country ? <Chip tone="neutral">{row.company.country}</Chip> : null}
            </div>
            <p className={cx("mt-1 text-ink-2", compact ? "line-clamp-2 text-xs" : "text-sm")}>
              {row.company.description || "No description."}
            </p>
            <p className="mt-1 text-xs text-muted">
              Last: {STAGE_LABEL[row.lastRound.stage]}
              {row.lastRound.date ? ` · ${fmtMonthYear(row.lastRound.date)}` : ""}
              {lead ? ` · ${lead.investorName}` : ""}
              {" · "}
              {fmtMonthsAgo(row.monthsSince)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {(compact ? row.reasons.slice(0, 3) : row.reasons).map((reason) => (
                <Chip key={reason.label} tone={reason.tone}>
                  {reason.label}
                </Chip>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 fit:mt-2">
              <Link href={companyHref(row.company.name, r.thesis, r.dataMode)} className={btn.secondary}>
                Company card
              </Link>
              <button type="button" className={btn.ghost} onClick={() => watchCompany(row.company.name, row.company.id, r.dataMode)}>
                ☆ Watch
              </button>
              <button type="button" className={btn.ghost} onClick={() => openRound(row.lastRound)}>
                Evidence
              </button>
              {onKyi ? (
                <ExpressInterest companyName={row.company.name} companyId={row.company.id} stage={onKyi.stage} dataMode={r.dataMode} />
              ) : null}
            </div>
          </div>
        </div>
      </Card>
    );
  }

  const kpiRow = (
    <>
      <Card className="p-4 sm:p-5 fit:p-2.5">
        <Label>Deals (12 mo)</Label>
        <p className="mt-2 text-2xl font-semibold tabular tracking-tight fit:mt-1 fit:text-lg">
          {r.kpis.deals12m}
          {r.kpis.trendPct != null ? (
            <span className={cx("ml-2 text-sm font-medium fit:text-xs", r.kpis.trendPct >= 0 ? "text-good" : "text-bad")}>
              {r.kpis.trendPct >= 0 ? "▲" : "▼"} {Math.abs(r.kpis.trendPct)}%
            </span>
          ) : null}
        </p>
      </Card>
      <Card className="p-4 sm:p-5 fit:p-2.5">
        <Label>Total raised</Label>
        <p className="mt-2 text-2xl font-semibold tabular tracking-tight fit:mt-1 fit:text-lg">{fmtEur(r.kpis.raised12mEur)}</p>
      </Card>
      <Card className="p-4 sm:p-5 fit:p-2.5">
        <Label>Median round</Label>
        <p className="mt-2 text-2xl font-semibold tabular tracking-tight fit:mt-1 fit:text-lg">{fmtEur(r.kpis.medianRoundEur)}</p>
      </Card>
      <Card className="p-4 sm:p-5 fit:p-2.5">
        <Label>Most active lead</Label>
        <p className="mt-2 truncate text-lg font-semibold tracking-tight fit:mt-1 fit:text-sm">{topLead?.name ?? "—"}</p>
        {topLead ? <p className="mt-0.5 text-xs text-muted">{topLead.leads} leads</p> : null}
      </Card>
    </>
  );

  return (
    <FitPage>
      <div className="hidden min-h-0 min-w-0 flex-1 flex-col gap-2 fit:flex">
        <div className="no-print flex shrink-0 flex-wrap items-center gap-2">
          <Link href="/invest" className={btn.ghost}>
            ← Thesis
          </Link>
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {r.thesis.sectors.map((s) => (
              <Chip key={s} tone="neutral">
                {sectorLabel(s)}
              </Chip>
            ))}
            {r.thesis.stages.map((s) => (
              <Chip key={s} tone="neutral">
                {STAGE_LABEL[s]}
              </Chip>
            ))}
            {r.thesis.regions.map((reg) => (
              <Chip key={reg} tone="neutral">
                {reg}
              </Chip>
            ))}
          </div>
          <span className="text-xs text-muted">
            <span className="tabular font-medium text-ink">{r.sampleSize}</span> rounds
          </span>
          <div className="ml-auto flex items-center gap-2">
            <DataNotesHint warnings={r.warnings} />
            <ModeBadge mode={r.dataMode} />
          </div>
        </div>

        <div data-testid="radar-kpis" className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4 fit:grid-cols-4">{kpiRow}</div>

        <div className="grid min-h-0 min-w-0 flex-1 gap-3 fit:grid-cols-[5fr_4fr_3fr]">
          <Card data-testid="company-to-watch" className="flex min-h-0 min-w-0 flex-col p-3">
            <Label>Raise-soon</Label>
            <h2 className="text-sm font-semibold">Companies to watch</h2>
            {r.toWatch.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No companies in the watch window.</p>
            ) : (
              <ul className="mt-2 min-h-0 flex-1 space-y-2 overflow-auto fit:fit-scroll">
                {r.toWatch.map((row, idx) => (
                  <li key={row.company.id}>{renderWatchRow(row, idx, true)}</li>
                ))}
              </ul>
            )}
          </Card>

          <div className="flex min-h-0 min-w-0 flex-col gap-2">
            <Card className="shrink-0 p-3">
              <Label>Funding per quarter</Label>
              <FundingQuarterChart data={r.quarterly} />
            </Card>
            <Card className="flex min-h-0 min-w-0 flex-1 flex-col p-3">
              <Label>Lead investors</Label>
              <ul className="mt-2 min-h-0 flex-1 divide-y divide-line/60 overflow-auto fit:fit-scroll">
                {r.topLeads.map((lead) => (
                  <li key={lead.investorId} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{lead.name}</p>
                      <p className="text-xs text-muted">
                        <span className="tabular">{lead.leads}</span> leads
                        {lead.lastLeadDate ? ` · ${fmtMonthYear(lead.lastLeadDate)}` : ""}
                      </p>
                    </div>
                    <Link href={investorReportHref(lead.name, r.dataMode)} className="shrink-0 text-xs text-accent hover:underline">
                      Report →
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card className="flex min-h-0 min-w-0 flex-col p-3">
            <Label>Recent rounds</Label>
            <ul className="mt-2 min-h-0 flex-1 space-y-2 overflow-auto fit:fit-scroll">
              {r.recentRounds.map((round) => {
                const lead = round.investors.find((p) => p.isLead === true);
                return (
                  <li key={round.id} className="border-b border-line/60 pb-2 text-sm last:border-0">
                    <button type="button" className="w-full text-left" onClick={() => openRound(round)}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{round.companyName}</span>
                        <span className="text-xs text-muted">{fmtMonthYear(round.date)}</span>
                      </div>
                      <p className="text-xs text-ink-2">
                        {round.stageLabel}
                        {round.amountLabel ? ` · ${round.amountLabel}` : ""}
                        {lead ? ` · ${lead.investorName}` : ""}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>

      <div className="fit:hidden">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/invest" className={btn.ghost}>
          ← Thesis
        </Link>
        <ModeBadge mode={r.dataMode} />
      </div>

      <header className="mb-8">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">Market Radar</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Where money flows</h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.thesis.sectors.map((s) => (
            <Chip key={s} tone="neutral">
              {sectorLabel(s)}
            </Chip>
          ))}
          {r.thesis.stages.map((s) => (
            <Chip key={s} tone="neutral">
              {STAGE_LABEL[s]}
            </Chip>
          ))}
          {r.thesis.regions.map((reg) => (
            <Chip key={reg} tone="neutral">
              {reg}
            </Chip>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">
          Based on <span className="tabular font-medium text-ink">{r.sampleSize}</span> rounds
          {r.dataMode === "cala" ? " in Cala" : " in the demo graph"}.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{kpiRow}</div>

      <Card className="mt-6 p-5 sm:p-6">
        <Label>Funding per quarter</Label>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">Deals and capital</h2>
        <div className="mt-4">
          <FundingQuarterChart data={r.quarterly} />
        </div>
      </Card>

      {/* Companies to watch — star of the page */}
      <section className="mt-10">
        <Label>Raise-soon</Label>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">Companies to watch</h2>
        <p className="mt-1 text-sm text-muted">Early-stage, 9–30 months since last raise, matching your thesis.</p>

        {r.toWatch.length === 0 ? (
          <Card className="mt-4 p-5 text-sm text-muted">No companies in the watch window for this thesis.</Card>
        ) : (
          <ul className="mt-5 space-y-3">
            {r.toWatch.map((row, idx) => (
              <li key={row.company.id}>{renderWatchRow(row, idx)}</li>
            ))}
          </ul>
        )}
      </section>

      {/* Top leads */}
      <Card className="mt-10 p-5 sm:p-6">
        <Label>Lead investors</Label>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">Who leads in this market</h2>
        <ul className="mt-4 divide-y divide-line/60">
          {r.topLeads.map((lead) => (
            <li key={lead.investorId} className="flex flex-wrap items-baseline justify-between gap-2 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="font-medium">{lead.name}</p>
                <p className="text-xs text-muted">
                  <span className="tabular">{lead.leads}</span> leads
                  {lead.lastLeadDate ? ` · last ${fmtMonthYear(lead.lastLeadDate)}` : ""}
                </p>
              </div>
              <Link href={investorReportHref(lead.name, r.dataMode)} className="shrink-0 text-sm text-accent hover:underline">
                Check co-investor →
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {/* Recent rounds */}
      <Card className="mt-6 p-5 sm:p-6">
        <Label>Activity</Label>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">Recent rounds</h2>
        <ul className="mt-4 space-y-4">
          {r.recentRounds.map((round) => {
            const lead = round.investors.find((p) => p.isLead === true);
            const others = round.investors.filter((p) => p.isLead !== true).map((p) => p.investorName);
            const src = round.sources[0];
            return (
              <li key={round.id} className="border-b border-line/60 pb-4 last:border-0 last:pb-0">
                <button type="button" className="w-full text-left" onClick={() => openRound(round)}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="font-medium">{round.companyName}</span>
                    <span className="text-xs text-muted">{fmtMonthYear(round.date)}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-2">
                    {round.stageLabel}
                    {round.amountLabel || round.amountEur != null
                      ? ` · ${round.amountLabel ?? fmtEur(round.amountEur)}`
                      : ""}
                    {lead ? ` · lead ${lead.investorName}` : ""}
                  </p>
                  {others.length > 0 ? (
                    <p className="mt-0.5 truncate text-xs text-muted">Also: {others.slice(0, 4).join(", ")}</p>
                  ) : null}
                </button>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <button type="button" className="text-accent hover:underline" onClick={() => openRound(round)}>
                    Evidence
                  </button>
                  {src?.url ? (
                    <a href={src.url} target="_blank" rel="noreferrer" className="text-muted hover:text-ink">
                      Source
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="no-print mt-8 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <Label>Data notes</Label>
          {r.warnings.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No data gaps flagged for this sample.</p>
          ) : (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-ink-2">
              {r.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <details>
            <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              Under the hood
            </summary>
            <p className="mt-2 text-xs text-muted">
              {r.trace.calls} calls · {r.trace.cacheHits} cache hits · {r.trace.ms} ms
            </p>
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto font-mono text-[10px] text-ink-2">
              {r.trace.queries.map((q) => (
                <li key={q} className="break-all">
                  {q}
                </li>
              ))}
            </ul>
          </details>
        </Card>
      </div>

      </div>

      <EvidenceDrawer evidence={evidence} mode={r.dataMode} investorId="" onClose={closeEvidence} />
    </FitPage>
  );
}
