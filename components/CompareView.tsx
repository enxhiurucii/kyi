"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { modeFromParams, postJSON, reportHref, startupFromParams } from "@/lib/client";
import { fmtEur, fmtMonthsAgo, fmtPct } from "@/lib/format";
import type { InvestorReport } from "@/lib/types";
import { STAGE_LABEL } from "@/lib/types";
import GraphLoading from "./GraphLoading";
import { btn, Card, Chip, cx, FitPage, ModeBadge, ScoreRing, StatusPill } from "./ui";

type State = { key: string; reports?: InvestorReport[]; error?: string };

interface Row {
  label: string;
  hint?: string;
  value: (r: InvestorReport) => string;
  /** higher is better → number used to highlight the winner; null = don't compare */
  score?: (r: InvestorReport) => number | null;
}

const ROWS: Row[] = [
  { label: "Fit for your startup", value: (r) => (r.fitScore ? `${r.fitScore.score} / 100` : "–"), score: (r) => r.fitScore?.score ?? null },
  { label: "Last deal", value: (r) => fmtMonthsAgo(r.activity.monthsSinceLastDeal), score: (r) => (r.activity.monthsSinceLastDeal === null ? null : -r.activity.monthsSinceLastDeal) },
  { label: "Deals in the last 12 months", value: (r) => String(r.activity.dealsLast12m), score: (r) => r.activity.dealsLast12m },
  { label: "Leads rounds", value: (r) => fmtPct(r.leadership.leadRate), score: (r) => r.leadership.leadRate },
  {
    label: "Invests again when startups raise",
    value: (r) => (r.followOn.eligible ? `${fmtPct(r.followOn.rate)} (${r.followOn.followed}/${r.followOn.eligible})` : "–"),
    score: (r) => r.followOn.rate,
  },
  {
    label: "Seed bets that raised again",
    value: (r) => (r.graduation.eligible ? `${fmtPct(r.graduation.rate)} (${r.graduation.graduated}/${r.graduation.eligible})` : "–"),
    score: (r) => r.graduation.rate,
  },
  { label: "Typical stage", value: (r) => (r.fit.typicalStage ? STAGE_LABEL[r.fit.typicalStage] : "–") },
  { label: "Median round", value: (r) => fmtEur(r.fit.medianRoundEur) },
  { label: "Backs a similar startup", value: (r) => (r.conflicts[0] ? `⚠ ${r.conflicts[0].companyName}` : "No"), score: (r) => (r.conflicts[0] ? -r.conflicts[0].similarity : 0) },
  { label: "Most frequent co-investor", value: (r) => (r.coInvestors[0] ? `${r.coInvestors[0].name} (${r.coInvestors[0].count})` : "–") },
];

export default function CompareView() {
  const sp = useSearchParams();
  const ids = useMemo(() => (sp.get("ids") ?? "").split("|").filter(Boolean).slice(0, 3), [sp]);
  const startup = useMemo(() => startupFromParams(new URLSearchParams(sp.toString())), [sp]);
  const mode = modeFromParams(new URLSearchParams(sp.toString()));
  const key = `${ids.join("|")}|${sp.get("d")}|${mode}`;
  const [state, setState] = useState<State>({ key: "" });

  useEffect(() => {
    if (ids.length < 2) return;
    const ac = new AbortController();
    let alive = true;
    Promise.all(ids.map((id) => postJSON<InvestorReport>("/api/report", { investor: id, startup: startup ?? undefined, mode, depth: "full" }, ac.signal)))
      .then((reports) => {
        if (alive) setState({ key, reports });
      })
      .catch((e: Error) => {
        if (alive && e.name !== "AbortError") setState({ key, error: e.message });
      });
    return () => {
      alive = false;
      ac.abort();
    };
  }, [ids, key, mode, startup]);

  const current = state.key === key ? state : null;

  if (ids.length < 2) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-10 sm:px-6">
        <Link href="/raise" className={btn.ghost}>
          ← All investors
        </Link>
        <div className="score-panel mt-6 rounded-3xl border border-line p-6">
          <h1 className="text-2xl font-semibold tracking-tight">Side by side</h1>
          <p className="mt-2 text-sm text-ink-2">Pick at least two funds with the Compare checkbox on the ranked list, then open compare again.</p>
          <Link href="/raise" className={`${btn.primary} mt-6`}>
            Back to ranking
          </Link>
        </div>
      </div>
    );
  }

  const tableBody = current?.reports ? (
    <table className="w-full min-w-[640px] text-sm fit:text-xs">
      <thead>
        <tr className="border-b border-line">
          <th className="w-56 px-5 py-4 fit:w-44 fit:px-3 fit:py-2" />
          {current.reports.map((r) => (
            <th key={r.investor.id} className="px-4 py-4 text-left align-top fit:px-3 fit:py-2">
              <div className="flex items-center gap-3 fit:gap-2">
                {r.fitScore && <ScoreRing score={r.fitScore.score} size={48} className="fit:!w-10 fit:!h-10" />}
                <div className="min-w-0">
                  <div className="truncate font-semibold">{r.investor.name}</div>
                  <div className="mt-1">
                    <StatusPill status={r.activity.status} />
                  </div>
                </div>
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ROWS.map((row) => {
          const scores = current.reports!.map((r) => row.score?.(r) ?? null);
          const valid = scores.filter((x): x is number => x !== null);
          const best = valid.length > 1 ? Math.max(...valid) : null;
          const allSame = valid.length > 1 && valid.every((v) => v === valid[0]);
          return (
            <tr key={row.label} className="border-b border-line last:border-0 fit:h-11">
              <td className="px-5 py-3 text-muted fit:px-3 fit:py-0">{row.label}</td>
              {current.reports!.map((r, i) => {
                const win = best !== null && !allSame && scores[i] === best;
                return (
                  <td key={r.investor.id} className={cx("px-4 py-3 font-medium fit:px-3 fit:py-0", win && "text-good")}>
                    {row.value(r)} {win && <Chip tone="good" className="ml-1 align-middle">best</Chip>}
                  </td>
                );
              })}
            </tr>
          );
        })}
        <tr>
          <td className="px-5 py-4 fit:px-3 fit:py-2" />
          {current.reports.map((r) => (
            <td key={r.investor.id} className="px-4 py-4 fit:px-3 fit:py-2">
              {startup && (
                <Link href={reportHref(r.investor.id, startup, r.dataMode)} className="text-sm text-accent hover:underline fit:text-xs">
                  Full report card →
                </Link>
              )}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  ) : null;

  return (
    <FitPage>
      <div className="mb-4 flex shrink-0 items-center justify-between fit:mb-2">
        <Link href="/raise" className={btn.ghost}>
          ← All investors
        </Link>
        {current?.reports?.[0] && <ModeBadge mode={current.reports[0].dataMode} />}
      </div>
      <h1 className="shrink-0 text-2xl font-semibold tracking-tight fit:text-lg">Side by side</h1>
      {startup && <p className="mt-1 shrink-0 text-sm text-ink-2 fit:text-xs">For “{startup.description}”</p>}

      {!current && (
        <GraphLoading
          className="mt-6 fit:mt-3"
          size="panel"
          eyebrow="Compare"
          title={`Building ${ids.length} report cards`}
          detail="Live mode walks Cala's graph (~10 req/min). First compare can take a few minutes; then it is cached."
          lines={["Walking each investor", "Aligning funding rounds", "Checking portfolio overlap", "Scoring side by side"]}
        />
      )}
      {current?.error && <div className="mt-6 rounded-2xl border border-bad/30 bg-bad-soft p-4 text-sm text-bad">{current.error}</div>}

      {current?.reports && (
        <Card className="score-panel mt-6 min-h-0 flex-1 overflow-hidden fit:mt-3 fit:flex fit:flex-col">
          <div data-testid="compare-table" className="min-h-0 flex-1 overflow-x-auto overflow-y-auto fit:fit-scroll">{tableBody}</div>
        </Card>
      )}
    </FitPage>
  );
}