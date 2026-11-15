"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  investorReportHref,
  modeFromParams,
  postJSON,
  thesisFromParams,
} from "@/lib/client";
import { fmtEur, fmtMonthYear } from "@/lib/format";
import { profileStore } from "@/lib/profileStore";
import type { CompanyReport, Round } from "@/lib/types";
import { STAGE_LABEL, type DataMode } from "@/lib/types";
import ExpressInterest, { isDiscoverableOnKyi, OnKyiBadge } from "./ExpressInterest";
import EvidenceDrawer, { type Evidence } from "./EvidenceDrawer";
import Tabs from "./Tabs";
import GraphLoading from "./GraphLoading";
import { btn, Card, Chip, FitPage, Label, ModeBadge, ScoreRing } from "./ui";

function DataNotesHint({ warnings }: { warnings: string[] }) {
  const title = warnings.length ? warnings.join(" · ") : "No gaps flagged.";
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

export default function CompanyView() {
  const sp = useSearchParams();
  const q = sp.get("q")?.trim() ?? "";
  const thesis = useMemo(() => thesisFromParams(sp), [sp]);
  const modeHint = modeFromParams(sp);
  const [report, setReport] = useState<CompanyReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const closeEvidence = useCallback(() => setEvidence(null), []);
  const [watched, setWatched] = useState(false);

  const key = `${q}|${thesis?.sectors.join(",")}|${modeHint ?? ""}`;

  useEffect(() => {
    if (!q) return;
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
        const r = await postJSON<CompanyReport>(
          "/api/company",
          { company: q, thesis: thesis ?? undefined, mode: modeHint },
          ac.signal,
        );
        if (ac.signal.aborted) return;
        setReport(r);
        setLoading(false);
        const wl = profileStore.getWatchlist();
        setWatched(wl.some((w) => w.companyRef === r.company.id || w.companyName === r.company.name));
      } catch (e) {
        if (ac.signal.aborted) return;
        setError(e instanceof ApiError ? e.message : (e as Error).message || "Company request failed.");
        setLoading(false);
      } finally {
        clearInterval(tick);
      }
    })();
    return () => {
      ac.abort();
      clearInterval(tick);
    };
  }, [key, q, thesis, modeHint]);

  function openRound(r: Round) {
    setEvidence({
      title: r.companyName,
      subtitle: `${r.stageLabel}${r.date ? ` · ${fmtMonthYear(r.date)}` : ""}`,
      groups: [{ title: "", rounds: [r] }],
    });
  }

  function toggleWatch(dataMode: DataMode) {
    if (!report) return;
    if (watched) {
      const item = profileStore.getWatchlist().find((w) => w.companyRef === report.company.id || w.companyName === report.company.name);
      if (item) profileStore.removeWatchlistItem(item.id);
      setWatched(false);
      return;
    }
    profileStore.upsertWatchlistItem({
      companyRef: report.company.id,
      companyName: report.company.name,
      dataMode,
    });
    setWatched(true);
  }

  if (!q) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Company card</h1>
        <p className="mt-2 text-sm text-muted">Pick a company from Market Radar or diligence search.</p>
        <Link href="/market" className={`${btn.primary} mt-6`}>
          Market Radar →
        </Link>
      </div>
    );
  }

  if (loading || (!report && !error)) {
    const live = modeHint !== "demo";
    return (
      <GraphLoading
        eyebrow={live ? "Live" : "Demo"}
        title={live ? "Reading Cala’s graph" : "Building company card"}
        detail={live ? "First time takes a minute, then cached…" : "Loading rounds and founders…"}
        lines={["Walking the investor", "Following funding rounds", "Opening founders", "Reading what happened next"]}
        elapsed={elapsed}
      />
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-bad/30 bg-bad-soft p-5 text-sm text-bad">{error}</div>
        <Link href="/market" className={`${btn.secondary} mt-6`}>
          ← Market Radar
        </Link>
      </div>
    );
  }

  const r = report!;
  const onKyi = isDiscoverableOnKyi(r.company.name, r.dataMode);

  const fundingPanel = (
    <>
      {r.rounds.length === 0 ? (
        <p className="text-sm text-muted">No rounds on file.</p>
      ) : (
        <ol className="space-y-4 fit:space-y-2">
          {r.rounds.map((round) => {
            const lead = round.investors.find((p) => p.isLead === true);
            return (
              <li key={round.id} className="border-l-2 border-line pl-4 fit:pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{round.stageLabel || STAGE_LABEL[round.stage]}</span>
                  <span className="text-xs text-muted">{fmtMonthYear(round.date)}</span>
                  {round.amountLabel || round.amountEur != null ? (
                    <span className="text-xs tabular text-ink-2">{round.amountLabel ?? fmtEur(round.amountEur)}</span>
                  ) : null}
                  {lead ? <Chip tone="good">Lead: {lead.investorName}</Chip> : null}
                </div>
                <p className="mt-1 text-xs text-muted line-clamp-2">
                  {round.investors.map((p) => p.investorName).join(" · ") || "Investors unknown"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <button type="button" className="text-accent hover:underline" onClick={() => openRound(round)}>
                    Evidence
                  </button>
                  {round.sources[0]?.url ? (
                    <a href={round.sources[0].url} target="_blank" rel="noreferrer" className="text-muted hover:text-ink">
                      Source
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );

  const investorsPanel =
    r.investors.length === 0 ? (
      <p className="text-sm text-muted">No investors listed.</p>
    ) : (
      <ul className="divide-y divide-line/60">
        {r.investors.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm first:pt-0">
            <span className="font-medium">
              {inv.name}
              {inv.isLead === true ? (
                <Chip tone="good" className="ml-2">
                  Lead
                </Chip>
              ) : null}
            </span>
            <Link href={investorReportHref(inv.name, r.dataMode)} className="text-accent hover:underline">
              Report card →
            </Link>
          </li>
        ))}
      </ul>
    );

  const foundersPanel =
    r.founders.length === 0 ? (
      <p className="text-sm text-muted">No founders linked in the graph.</p>
    ) : (
      <ul className="space-y-3 fit:space-y-2">
        {r.founders.map((f) => (
          <li key={f.id ?? f.name}>
            <p className="font-medium text-sm">{f.name}</p>
            <p className="text-xs text-muted">
              {f.role ?? "Founder"}
              {f.pastCompanies.length ? ` · ${f.pastCompanies.join(", ")}` : ""}
            </p>
          </li>
        ))}
      </ul>
    );

  return (
    <FitPage className="fit:max-w-7xl">
      {/* —— Fit dashboard —— */}
      <div className="hidden min-h-0 min-w-0 flex-1 flex-col gap-3 fit:flex">
        <div className="no-print flex shrink-0 items-center justify-between gap-2">
          <Link href="/market" className={btn.ghost}>
            ← Market Radar
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <DataNotesHint warnings={r.warnings} />
            <ModeBadge mode={r.dataMode} />
            <button type="button" className={btn.secondary} onClick={() => toggleWatch(r.dataMode)}>
              {watched ? "★ Watched" : "☆ Watch"}
            </button>
            <button type="button" className={btn.secondary} onClick={() => window.print()}>
              Print
            </button>
          </div>
        </div>

        <Card data-testid="company-card" className="print-break-avoid shrink-0 p-4">
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold tracking-tight">{r.company.name}</h1>
              <p className="mt-1 line-clamp-2 text-sm text-ink-2">{r.company.description || "No description in the graph."}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {onKyi ? <OnKyiBadge stage={onKyi.stage} /> : null}
                {r.company.country ? <Chip tone="neutral">{r.company.country}</Chip> : null}
                {r.company.sectors.slice(0, 4).map((s) => (
                  <Chip key={s} tone="neutral">
                    {s}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-3" data-testid="company-card-header">
              {r.raiseSoon ? (
                <div className="flex items-center gap-2">
                  <ScoreRing score={r.raiseSoon.score} size={52} label="Raise-soon" />
                  <div className="hidden text-xs sm:block">
                    <Label>Raise-soon</Label>
                    <div className="mt-1 flex max-w-[10rem] flex-wrap gap-1">
                      {r.raiseSoon.reasons.slice(0, 3).map((x) => (
                        <Chip key={x.label} tone={x.tone}>
                          {x.label}
                        </Chip>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              {r.thesisFit ? <ScoreRing score={r.thesisFit.score} size={52} label="Thesis fit" /> : null}
              {onKyi ? (
                <ExpressInterest
                  className="no-print shrink-0"
                  companyName={r.company.name}
                  companyId={r.company.id}
                  stage={onKyi.stage}
                  dataMode={r.dataMode}
                />
              ) : null}
            </div>
          </div>
        </Card>

        <div className="grid min-h-0 min-w-0 flex-1 grid-cols-3 gap-3">
          <Card data-testid="funding-timeline" className="flex min-h-0 min-w-0 flex-col p-4">
            <Label>Funding</Label>
            <h2 className="text-sm font-semibold">Timeline</h2>
            <div className="mt-2 min-h-0 flex-1 overflow-auto fit:fit-scroll">{fundingPanel}</div>
          </Card>
          <Card data-testid="company-side-tabs" className="flex min-h-0 min-w-0 flex-col overflow-hidden p-4">
            <Tabs
              className="min-h-0 flex-1"
              initial="investors"
              tabs={[
                {
                  id: "investors",
                  label: "Investors",
                  panel: <div data-testid="company-investors">{investorsPanel}</div>,
                },
                {
                  id: "founders",
                  label: "Founders",
                  panel: <div data-testid="company-founders">{foundersPanel}</div>,
                },
              ]}
            />
          </Card>
          <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden p-4">
            <Tabs
              className="min-h-0 flex-1"
              initial="similar"
              tabs={[
                {
                  id: "similar",
                  label: "Similar",
                  panel:
                    r.similar.length === 0 ? (
                      <p className="text-sm text-muted">No similar companies scored.</p>
                    ) : (
                      <ul className="space-y-2">
                        {r.similar.map((s) => (
                          <li key={s.company.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span>
                              <span className="font-medium">{s.company.name}</span>
                              <span className="text-muted"> · {Math.round(s.similarity * 100)}%</span>
                            </span>
                            <Link
                              href={`/company?q=${encodeURIComponent(s.company.name)}${modeHint ? `&mode=${modeHint}` : ""}`}
                              className="text-accent hover:underline"
                            >
                              Open →
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ),
                },
                {
                  id: "sources",
                  label: "Sources",
                  panel:
                    r.sources.length === 0 ? (
                      <p className="text-sm text-muted">No source URLs attached.</p>
                    ) : (
                      <ul className="space-y-1 text-sm">
                        {r.sources.slice(0, 12).map((s) => (
                          <li key={s.url ?? s.name}>
                            {s.url ? (
                              <a href={s.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                                {s.name}
                              </a>
                            ) : (
                              <span className="text-ink-2">{s.name}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ),
                },
              ]}
            />
          </Card>
        </div>
      </div>

      {/* —— Mobile / stacked —— */}
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-6 sm:px-6 fit:hidden">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/market" className={btn.ghost}>
          ← Market Radar
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <ModeBadge mode={r.dataMode} />
          <button type="button" className={btn.secondary} onClick={() => toggleWatch(r.dataMode)}>
            {watched ? "★ Watched" : "☆ Watch"}
          </button>
          <button type="button" className={btn.secondary} onClick={() => window.print()}>
            Print one-pager
          </button>
        </div>
      </div>

      <Card className="print-break-avoid p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-semibold tracking-tight">{r.company.name}</h1>
            <p className="mt-2 text-ink-2">{r.company.description || "No description in the graph."}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {onKyi ? <OnKyiBadge stage={onKyi.stage} /> : null}
              {r.company.country ? <Chip tone="neutral">{r.company.country}</Chip> : null}
              {r.company.sectors.map((s) => (
                <Chip key={s} tone="neutral">
                  {s}
                </Chip>
              ))}
              {r.company.foundedYear ? <Chip tone="neutral">Founded {r.company.foundedYear}</Chip> : null}
              {r.company.status ? <Chip tone="good">{r.company.status}</Chip> : null}
            </div>
          </div>
          {onKyi ? (
            <ExpressInterest
              className="no-print shrink-0"
              companyName={r.company.name}
              companyId={r.company.id}
              stage={onKyi.stage}
              dataMode={r.dataMode}
            />
          ) : null}
        </div>
      </Card>

      {(r.raiseSoon || r.thesisFit) && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {r.raiseSoon ? (
            <Card className="print-break-avoid p-5">
              <div className="flex items-start gap-4">
                <ScoreRing score={r.raiseSoon.score} size={64} label="Raise-soon" />
                <div>
                  <Label>Raise-soon</Label>
                  <p className="mt-1 text-sm font-semibold">Likelihood of raising again</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.raiseSoon.reasons.map((x) => (
                      <Chip key={x.label} tone={x.tone}>
                        {x.label}
                      </Chip>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          ) : null}
          {r.thesisFit ? (
            <Card className="print-break-avoid p-5">
              <div className="flex items-start gap-4">
                <ScoreRing score={r.thesisFit.score} size={64} label="Thesis fit" />
                <div>
                  <Label>Thesis fit</Label>
                  <p className="mt-1 text-sm font-semibold">Match to your thesis</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.thesisFit.reasons.map((x) => (
                      <Chip key={x.label} tone={x.tone}>
                        {x.label}
                      </Chip>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      )}

      <Card className="mt-6 p-5 sm:p-6">
        <Label>Funding</Label>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">Timeline</h2>
        {r.rounds.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No rounds on file.</p>
        ) : (
          <ol className="mt-4 space-y-4">
            {r.rounds.map((round) => {
              const lead = round.investors.find((p) => p.isLead === true);
              return (
                <li key={round.id} className="border-l-2 border-line pl-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{round.stageLabel || STAGE_LABEL[round.stage]}</span>
                    <span className="text-xs text-muted">{fmtMonthYear(round.date)}</span>
                    {round.amountLabel || round.amountEur != null ? (
                      <span className="text-xs tabular text-ink-2">{round.amountLabel ?? fmtEur(round.amountEur)}</span>
                    ) : null}
                    {lead ? <Chip tone="good">Lead: {lead.investorName}</Chip> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {round.investors.map((p) => p.investorName).join(" · ") || "Investors unknown"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <button type="button" className="text-accent hover:underline" onClick={() => openRound(round)}>
                      Evidence
                    </button>
                    {round.sources[0]?.url ? (
                      <a href={round.sources[0].url} target="_blank" rel="noreferrer" className="text-muted hover:text-ink">
                        Source
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      <Card className="mt-6 overflow-hidden p-0">
        <div className="border-b border-line p-5">
          <Label>Cap table signal</Label>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">Investors</h2>
        </div>
        <ul className="divide-y divide-line/60">
          {r.investors.length === 0 ? (
            <li className="p-5 text-sm text-muted">No investors listed.</li>
          ) : (
            r.investors.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span className="font-medium">
                  {inv.name}
                  {inv.isLead === true ? <Chip tone="good" className="ml-2">Lead</Chip> : null}
                </span>
                <Link href={investorReportHref(inv.name, r.dataMode)} className="text-accent hover:underline">
                  Report card →
                </Link>
              </li>
            ))
          )}
        </ul>
      </Card>

      <Card className="mt-6 p-5">
        <Label>People</Label>
        <h2 className="mt-1 text-lg font-semibold tracking-tight">Founders</h2>
        {r.founders.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No founders linked in the graph.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {r.founders.map((f) => (
              <li key={f.id ?? f.name}>
                <p className="font-medium">{f.name}</p>
                <p className="text-xs text-muted">
                  {f.role ?? "Founder"}
                  {f.pastCompanies.length ? ` · ${f.pastCompanies.join(", ")}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {r.similar.length > 0 ? (
        <Card className="mt-6 p-5">
          <Label>Similar</Label>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">Companies like this</h2>
          <ul className="mt-3 space-y-2">
            {r.similar.map((s) => (
              <li key={s.company.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-medium">{s.company.name}</span>
                  <span className="text-muted"> · {Math.round(s.similarity * 100)}% text overlap</span>
                </span>
                <Link
                  href={`/company?q=${encodeURIComponent(s.company.name)}${modeHint ? `&mode=${modeHint}` : ""}`}
                  className="text-accent hover:underline"
                >
                  Open →
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mt-6 p-5">
        <Label>Sources</Label>
        {r.sources.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No source URLs attached — open round evidence for provenance.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {r.sources.slice(0, 12).map((s) => (
              <li key={s.url ?? s.name}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    {s.name}
                  </a>
                ) : (
                  <span className="text-ink-2">{s.name}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="no-print mt-6 grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <Label>Data notes</Label>
          {r.warnings.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No gaps flagged.</p>
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
              {r.trace.queries.map((qline) => (
                <li key={qline} className="break-all">
                  {qline}
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
