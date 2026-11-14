"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { reportHref } from "@/lib/client";
import { fmtMonthsAgo, fmtPct } from "@/lib/format";
import { FIT_BUCKET_MAX } from "@/lib/scoring";
import type { DataMode, FitBreakdown, RankedInvestor, Startup } from "@/lib/types";
import { STAGE_LABEL } from "@/lib/types";
import { btn, Chip, cx, ScoreRing, StatusPill } from "./ui";

const BUCKETS: { key: keyof Omit<FitBreakdown, "conflict">; label: string; max: number }[] = [
  { key: "activity", label: "Still investing", max: FIT_BUCKET_MAX.activity },
  { key: "stage", label: "Your stage", max: FIT_BUCKET_MAX.stage },
  { key: "sector", label: "Your sector", max: FIT_BUCKET_MAX.sector },
  { key: "leads", label: "Leads rounds", max: FIT_BUCKET_MAX.leads },
  { key: "followOn", label: "Invests again", max: FIT_BUCKET_MAX.followOn },
  { key: "geo", label: "Your country", max: FIT_BUCKET_MAX.geo },
];

export default function RankedList({
  ranked,
  startup,
  mode,
  selected,
  onToggle,
  compact = false,
}: {
  ranked: RankedInvestor[];
  startup: Startup;
  mode: DataMode;
  selected: string[];
  onToggle: (id: string) => void;
  compact?: boolean;
}) {
  const rankedKey = ranked.map((r) => r.investor.id).join("|");
  const [listKey, setListKey] = useState(rankedKey);
  const [visible, setVisible] = useState(compact ? ranked.length : 0);
  const [openId, setOpenId] = useState<string | null>(null);

  if (listKey !== rankedKey) {
    setListKey(rankedKey);
    setVisible(compact ? ranked.length : 0);
    setOpenId(null);
  }

  useEffect(() => {
    if (compact || ranked.length === 0) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setVisible(i);
      if (i >= ranked.length) window.clearInterval(id);
    }, 140);
    return () => window.clearInterval(id);
  }, [rankedKey, ranked.length, compact]);

  const shown = ranked.slice(0, Math.max(visible, compact ? ranked.length : 0));

  if (compact) {
    return (
      <ol className="space-y-1.5" data-testid="shortlist">
        {shown.map((r, i) => {
          const id = r.investor.id;
          const checked = selected.includes(id);
          return (
            <li
              key={id}
              data-testid={
                i === 0
                  ? "shortlist-first"
                  : /aurora/i.test(r.investor.name)
                    ? "shortlist-row-aurora"
                    : /sisu/i.test(r.investor.name)
                      ? "shortlist-row-sisu"
                      : "shortlist-row"
              }
              className="flex h-[76px] min-w-0 items-center gap-2 rounded-2xl border border-line/80 bg-black/25 px-2.5"
            >
              <label className="flex shrink-0 cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(id)}
                  className="accent-[var(--accent)]"
                  aria-label={`Select ${r.investor.name} to compare`}
                />
              </label>
              <span className={cx("w-5 shrink-0 font-mono text-xs tabular", i === 0 ? "text-accent" : "text-muted")}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <ScoreRing score={r.fitScore.score} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-semibold tracking-tight">{r.investor.name}</span>
                  <StatusPill status={r.status} />
                  {r.topConflict ? <Chip tone="bad">Conflict</Chip> : null}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2.5 text-[10px] text-muted">
                  <span>Last {fmtMonthsAgo(r.monthsSinceLastDeal)}</span>
                  <span>12m {r.dealsLast12m}</span>
                  <span>Leads {fmtPct(r.leadRate)}</span>
                  {r.typicalStage ? <span>{STAGE_LABEL[r.typicalStage]}</span> : null}
                </div>
              </div>
              <Link href={reportHref(r.investor.id || r.investor.name, startup, mode)} className={`${btn.secondary} shrink-0 !px-2.5 !py-1.5 text-xs`}>
                Report card
              </Link>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <div className="score-panel rounded-3xl border border-line p-4 sm:p-6">
      <p className="mb-4 text-sm text-ink-2">
        {visible < ranked.length ? (
          <>
            Showing <span className="tabular font-medium text-ink">{visible}</span> of {ranked.length}…
          </>
        ) : (
          <>Tick Compare on 2+ funds, then use the bar at the bottom. Tap a name for the fit brief.</>
        )}
      </p>

      <ol className="space-y-2" data-testid="shortlist">
        {shown.map((r, i) => {
          const id = r.investor.id;
          const checked = selected.includes(id);
          const top = i === 0;
          const open = openId === id;
          const b = r.fitScore.breakdown;

          return (
            <li
              key={id}
              data-testid={
                i === 0
                  ? "shortlist-first"
                  : /aurora/i.test(r.investor.name)
                    ? "shortlist-row-aurora"
                    : /sisu/i.test(r.investor.name)
                      ? "shortlist-row-sisu"
                      : "shortlist-row"
              }
              className={cx(
                "animate-[kyi-fade-up_380ms_ease-out] rounded-2xl transition",
                open ? "rank-focus bg-[#12151c] p-4 ring-1 ring-accent/40 sm:p-5" : "border border-transparent px-2 py-3 hover:bg-black/40 sm:px-3",
              )}
              style={{ animationDelay: `${Math.min(i, 8) * 20}ms` }}
            >
              <div className="flex flex-wrap items-start gap-3 sm:gap-4">
                <label
                  className={cx(
                    "mt-1 flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px]",
                    checked ? "border-accent/50 bg-accent-soft text-ink" : "border-line text-ink-2 hover:border-white/20",
                  )}
                  title="Select for side-by-side compare"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(id)}
                    className="accent-[var(--accent)]"
                    aria-label={`Select ${r.investor.name} to compare`}
                  />
                  Compare
                </label>

                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-wrap items-start gap-4 text-left sm:gap-5"
                  onClick={() => setOpenId(open ? null : id)}
                  aria-expanded={open}
                >
                  <div className={cx("font-mono text-sm tabular", top ? "text-accent" : "text-muted")}>
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <ScoreRing score={r.fitScore.score} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cx("text-lg font-semibold tracking-tight text-ink", open && "text-accent")}>
                        {r.investor.name}
                      </span>
                      <StatusPill status={r.status} />
                      {top && <Chip tone="good">Best fit</Chip>}
                      <span className="text-xs text-ink-2">{open ? "Hide ↑" : "Open ↓"}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-2">
                      {[r.investor.kind, r.investor.country].filter(Boolean).join(" · ")}
                      {r.typicalStage ? ` · often ${STAGE_LABEL[r.typicalStage]}` : ""}
                    </p>
                  </div>
                </button>
                <Link href={reportHref(r.investor.id || r.investor.name, startup, mode)} className={`${btn.secondary} shrink-0 text-xs`}>
                  Report card
                </Link>
              </div>

              {open && (
                <div className="mt-4 border-t border-white/10 pt-4 sm:ml-[7.5rem]">
                  {r.topConflict && (
                    <p className="mb-3 rounded-xl border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">
                      Conflict signal: {r.topConflict.companyName}
                      {r.topConflict.description ? ` — ${r.topConflict.description}` : ""}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
                    <span>
                      Last deal <strong className="font-medium text-ink">{fmtMonthsAgo(r.monthsSinceLastDeal)}</strong>
                    </span>
                    <span>
                      Deals · 12 mo <strong className="font-medium text-ink">{r.dealsLast12m}</strong>
                    </span>
                    <span>
                      Leads <strong className="font-medium text-ink">{fmtPct(r.leadRate)}</strong>
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {r.fitScore.reasons.map((x) => (
                      <Chip key={x.label} tone={x.tone}>
                        {x.label}
                      </Chip>
                    ))}
                  </div>
                  {b && (
                    <ul className="mt-4 max-w-lg space-y-2.5 rounded-xl bg-black/40 p-4 ring-1 ring-white/8">
                      <li className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">Why this score</li>
                      {BUCKETS.map((row) => {
                        const pts = b[row.key];
                        const pct = Math.max(0, Math.min(100, (pts / row.max) * 100));
                        return (
                          <li key={row.key} className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-2">
                            <span className="truncate text-[11px] text-ink-2">{row.label}</span>
                            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                              <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="tabular text-right text-[11px] text-ink-2">
                              {pts}/{row.max}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
