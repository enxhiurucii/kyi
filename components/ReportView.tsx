"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { compareHref, modeFromParams, postJSON, startupFromParams } from "@/lib/client";
import { profileStore } from "@/lib/profileStore";
import { fmtEur, fmtMonthsAgo, fmtMonthYear, fmtPct } from "@/lib/format";
import type { InvestorReport, Round, Tone } from "@/lib/types";
import { STAGE_LABEL } from "@/lib/types";
import AskPanel from "./AskPanel";
import EvidenceDrawer, { type Evidence } from "./EvidenceDrawer";
import Tabs from "./Tabs";
import { Bars, btn, Card, Chip, cx, FitPage, Label, ModeBadge, ScoreRing, Sparkline, StatusPill } from "./ui";

type State = { key: string; report?: InvestorReport; error?: string };

export default function ReportView() {
  const sp = useSearchParams();
  const inv = sp.get("inv") ?? "";
  const startup = useMemo(() => startupFromParams(new URLSearchParams(sp.toString())), [sp]);
  const mode = modeFromParams(new URLSearchParams(sp.toString()));
  const key = `${inv}|${sp.get("d")}|${sp.get("s")}|${sp.get("c")}|${mode}`;
  const [state, setState] = useState<State>({ key: "" });
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const closeEvidence = useCallback(() => setEvidence(null), []);

  useEffect(() => {
    if (!inv) return;
    const ac = new AbortController();
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    postJSON<InvestorReport>(
      "/api/report",
      {
        investor: inv,
        startup: startup ?? undefined,
        company: startup ? profileStore.getCompany() : undefined,
        mode,
        depth: "full",
      },
      ac.signal,
    )
      .then((report) => setState({ key, report }))
      .catch((e: Error) => {
        if (!ac.signal.aborted) setState({ key, error: e.message });
      })
      .finally(() => clearInterval(tick));
    return () => {
      ac.abort();
      clearInterval(tick);
    };
  }, [inv, key, mode, startup]);

  if (!inv) return <Shell>Missing investor.</Shell>;
  const current = state.key === key ? state : null;
  if (!current) return <ReportSkeleton elapsed={elapsed} live={mode !== "demo"} />;
  if (current.error) {
    return (
      <Shell>
        <div className="rounded-2xl border border-bad/30 bg-bad-soft p-5 text-sm text-bad">{current.error}</div>
      </Shell>
    );
  }
  const r = current.report!;
  const rounds = (ids: string[]) => ids.map((id) => r.rounds[id]).filter((x): x is Round => !!x);
  const backHref = "/raise";
  const compareWith = startup ? compareHref([r.investor.id], startup, r.dataMode) : null;

  const open = (title: string, subtitle: string, ids: string[]) =>
    setEvidence({ title, subtitle, groups: [{ title: "", rounds: rounds(ids) }] });
  const openOutcomes = (title: string, subtitle: string, list: InvestorReport["followOn"]["companies"], yes: string, no: string) =>
    setEvidence({
      title,
      subtitle,
      groups: list.map((c) => ({
        title: c.companyName,
        badge: c.yes ? yes : no,
        tone: c.yes ? "good" : "bad",
        rounds: rounds(c.roundIds),
      })),
    });

  const statusLine =
    r.activity.status === "active"
      ? "Still investing"
      : r.activity.status === "slowing"
        ? "Slowing down"
        : r.activity.status === "inactive"
          ? "Not investing lately"
          : "Unknown";
  const recent = Object.values(r.rounds)
    .filter((x) => x.investors.some((p) => p.investorId === r.investor.id))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 12);

  const tiles = (
    <div className="grid min-h-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 fit:h-full fit:grid-rows-2" data-testid="report-tiles">
      <Tile
        q="Still investing?"
        big={statusLine}
        tone={r.activity.status === "active" ? "good" : r.activity.status === "slowing" ? "warn" : r.activity.status === "inactive" ? "bad" : "neutral"}
        sub={`Last ${fmtMonthsAgo(r.activity.monthsSinceLastDeal)} · ${r.activity.dealsLast12m} / 12 mo`}
        onClick={() => open("Deals in the last 12 months", `${r.activity.dealsLast12m} deals`, r.activity.roundIds)}
      >
        <Sparkline data={r.activity.quarterly} height={36} />
      </Tile>
      <Tile
        q="Do they lead?"
        big={fmtPct(r.leadership.leadRate)}
        tone={r.leadership.leadRate === null ? "neutral" : r.leadership.leadRate >= 0.4 ? "good" : r.leadership.leadRate <= 0.15 ? "warn" : "neutral"}
        sub={r.leadership.knownRoles ? `Led ${r.leadership.leads}/${r.leadership.knownRoles}` : "Lead role unknown"}
        onClick={() => open("Rounds they led", `${r.leadership.leads} led`, r.leadership.roundIds)}
      />
      <Tile
        q="Invest again?"
        big={r.depth === "quick" ? "…" : fmtPct(r.followOn.rate)}
        tone={r.followOn.rate === null ? "neutral" : r.followOn.rate >= 0.45 ? "good" : r.followOn.rate <= 0.2 ? "warn" : "neutral"}
        sub={r.followOn.eligible ? `${r.followOn.followed}/${r.followOn.eligible}` : "Thin sample"}
        onClick={() => openOutcomes("Did they invest again?", "Entry then later", r.followOn.companies, "Came back", "Did not")}
      />
      <Tile
        q="Raise again?"
        big={fmtPct(r.graduation.rate)}
        tone={r.graduation.rate === null ? "neutral" : r.graduation.rate >= 0.45 ? "good" : r.graduation.rate <= 0.2 ? "warn" : "neutral"}
        sub={r.graduation.eligible ? `${r.graduation.graduated}/${r.graduation.eligible}` : "Thin sample"}
        onClick={() => openOutcomes("Did startups raise again?", "Early deals 18+ mo", r.graduation.companies, "Raised again", "Not yet")}
      />
      <Tile q="Typical deal" big={r.fit.typicalStage ? STAGE_LABEL[r.fit.typicalStage] : "–"} sub={`Median ${fmtEur(r.fit.medianRoundEur)}`}>
        <Bars items={r.fit.stages.slice(0, 4)} />
      </Tile>
      <Tile q="Co-investors" big={r.coInvestors[0]?.name ?? "–"} sub={r.coInvestors[0] ? `${r.coInvestors[0].count} shared` : "None"}>
        <ul className="space-y-0.5">
          {r.coInvestors.slice(1, 4).map((c) => (
            <li key={c.name}>
              <button className="flex w-full justify-between text-xs hover:text-accent" onClick={() => open(`Deals with ${c.name}`, `${c.count} shared`, c.roundIds)}>
                <span className="truncate">{c.name}</span>
                <span className="tabular text-muted">{c.count}</span>
              </button>
            </li>
          ))}
        </ul>
      </Tile>
    </div>
  );

  const briefPanel = (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-muted">
        {statusLine} · last {fmtMonthsAgo(r.activity.monthsSinceLastDeal)} · leads {fmtPct(r.leadership.leadRate)}
      </p>
      {r.talkingPoints.length ? (
        <ul className="space-y-2">
          {r.talkingPoints.map((t, i) => (
            <li key={i} className="flex gap-2">
              <ToneDot tone={t.tone} />
              <div className="text-xs text-ink-2">
                {t.text}{" "}
                {t.roundIds.length > 0 && (
                  <button className="no-print text-[10px] text-accent hover:underline" onClick={() => open("Evidence", t.text, t.roundIds)}>
                    evidence
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">Nothing notable — a neutral meeting.</p>
      )}
    </div>
  );

  const dealsPanel = (
    <div className="overflow-auto text-xs">
      <table className="w-full min-w-[520px]">
        <thead className="text-left text-muted">
          <tr className="border-b border-line">
            <th className="py-1 pr-2 font-medium">Date</th>
            <th className="py-1 pr-2 font-medium">Company</th>
            <th className="py-1 pr-2 font-medium">Round</th>
            <th className="py-1 font-medium">Role</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((x) => {
            const me = x.investors.find((p) => p.investorId === r.investor.id);
            return (
              <tr key={x.id} className="border-b border-line/60">
                <td className="tabular whitespace-nowrap py-1.5 pr-2 text-muted">{fmtMonthYear(x.date)}</td>
                <td className="py-1.5 pr-2 font-medium">{x.companyName || "—"}</td>
                <td className="py-1.5 pr-2">{x.stageLabel}</td>
                <td className="py-1.5">{me?.isLead ? <Chip tone="good">Lead</Chip> : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const wherePanel = (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label>Sectors</Label>
        <Bars items={r.fit.sectors} />
      </div>
      <div>
        <Label>Countries</Label>
        <Bars items={r.fit.countries} />
      </div>
    </div>
  );

  const hoodPanel = (
    <div className="space-y-2 text-xs">
      <p className="text-muted">
        {r.trace.calls} {r.dataMode === "cala" ? "Cala calls" : "lookups"}, {r.trace.cacheHits} cache, {(r.trace.ms / 1000).toFixed(1)}s
      </p>
      <ul className="max-h-48 space-y-1 overflow-auto">
        {r.trace.queries.map((q) => (
          <li key={q} className="break-all rounded-lg bg-surface-2 px-2 py-1 font-mono text-[10px] text-ink-2">
            {q}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <FitPage>
      <div className="flex min-h-0 min-w-0 flex-col gap-2 fit:h-full">
        <div className="no-print flex shrink-0 flex-wrap items-center justify-between gap-2">
          <Link href={backHref} className={btn.ghost}>
            ← All investors
          </Link>
          <div className="flex items-center gap-2">
            <ModeBadge mode={r.dataMode} />
            <button className={btn.secondary} onClick={() => window.print()}>
              Print
            </button>
            {compareWith ? (
              <Link href={compareWith} className={btn.secondary}>
                Compare
              </Link>
            ) : null}
          </div>
        </div>

        {/* Header strip ≈ 120px on fit */}
        <Card className="print-break-avoid shrink-0 p-3 fit:max-h-[120px] fit:overflow-hidden" data-testid="report-header">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight fit:text-lg">{r.investor.name}</h1>
                <StatusPill status={r.activity.status} />
                <span className="text-xs text-muted">{[r.investor.kind, r.investor.country].filter(Boolean).join(" · ")}</span>
              </div>
              {startup && r.fitScore ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {r.fitScore.reasons.slice(0, 4).map((x) => (
                    <Chip key={x.label} tone={x.tone}>
                      {x.label}
                    </Chip>
                  ))}
                </div>
              ) : null}
            </div>
            {startup && r.fitScore ? <ScoreRing score={r.fitScore.score} size={72} label="Fit" /> : null}
          </div>
        </Card>

        {startup && r.conflicts[0] ? (
          <button
            data-testid="conflict-banner"
            onClick={() => open(`Already backs ${r.conflicts[0].companyName}`, r.conflicts[0].description, r.conflicts[0].roundIds)}
            className={cx(
              "flex w-full shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-xs",
              r.conflicts[0].similarity >= 0.45 ? "border-bad/30 bg-bad-soft text-bad" : "border-warn/30 bg-warn-soft text-warn",
            )}
          >
            ⚠ {r.conflicts[0].similarity >= 0.45 ? "Conflict" : "Possible conflict"}: {r.conflicts[0].companyName} — {r.conflicts[0].description}
          </button>
        ) : null}

        {/* Fit dashboard */}
        <div className="hidden min-h-0 flex-1 grid-cols-[8fr_4fr] gap-3 fit:grid">
          <div className="min-h-0 min-w-0">{tiles}</div>
          <Card className="flex min-h-0 min-w-0 flex-col overflow-hidden p-3">
            <Tabs
              className="min-h-0 flex-1"
              panelClassName="fit-scroll"
              tabs={[
                { id: "brief", label: "Meeting brief", panel: briefPanel },
                { id: "deals", label: "Recent deals", panel: dealsPanel },
                { id: "where", label: "Where they invest", panel: wherePanel },
                { id: "hood", label: "Under the hood", panel: hoodPanel },
              ]}
            />
          </Card>
        </div>

        {/* Mobile stacked */}
        <div className="space-y-3 fit:hidden">
          <Card className="p-4">
            <Label>Meeting brief</Label>
            <div className="mt-2">{briefPanel}</div>
          </Card>
          <details className="rounded-2xl border border-line bg-black/20 p-4">
            <summary className="cursor-pointer text-sm font-medium text-ink-2">Show charts &amp; deal history</summary>
            <div className="mt-3">{tiles}</div>
            <div className="mt-3">{dealsPanel}</div>
          </details>
          {r.warnings.length > 0 ? (
            <Card className="data-notes p-4">
              <Label>Data notes</Label>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                {r.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="present-hide fit:hidden">
          <AskPanel
            investorName={r.investor.name}
            investorId={r.investor.entityId || r.investor.id || r.investor.name}
            startup={startup}
            mode={r.dataMode}
            rounds={r.rounds}
            onEvidence={setEvidence}
          />
        </div>

        <EvidenceDrawer evidence={evidence} mode={r.dataMode} investorId={r.investor.id} onClose={closeEvidence} />
      </div>
    </FitPage>
  );
}

function Tile({
  q,
  big,
  sub,
  tone = "neutral",
  onClick,
  children,
}: {
  q: string;
  big: string;
  sub: string;
  tone?: Tone;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const color = tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : "text-ink";
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <Label>{q}</Label>
        {onClick && <span className="no-print text-[10px] text-accent opacity-0 transition group-hover:opacity-100">sources →</span>}
      </div>
      <div className={cx("mt-1 truncate text-lg font-semibold tracking-tight fit:text-base", color)}>{big}</div>
      <div className="mt-0.5 text-[11px] text-muted">{sub}</div>
      {children && <div className="mt-2 min-h-0 flex-1">{children}</div>}
    </>
  );
  const cls =
    "group print-break-avoid card-glass flex min-h-0 flex-col justify-start rounded-2xl p-3 text-left transition hover:border-accent/40 fit:h-full fit:min-h-[120px]";
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function ToneDot({ tone }: { tone: Tone }) {
  const c = tone === "good" ? "bg-good" : tone === "warn" ? "bg-warn" : tone === "bad" ? "bg-bad" : "bg-muted";
  return <span className={cx("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", c)} aria-hidden />;
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">{children}</div>;
}

const WALK_LINES = ["Walking the investor", "Following funding rounds", "Opening portfolio companies", "Reading what happened next"];

export function ReportSkeleton({ elapsed = 0, live = false }: { elapsed?: number; live?: boolean }) {
  const line = WALK_LINES[Math.min(WALK_LINES.length - 1, Math.floor(elapsed / 4))];
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6" aria-live="polite">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">{live ? "Live" : "Demo"}</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{line}</h1>
      <p className="mt-2 text-sm text-muted">
        {live
          ? `First full card ~2–4 min on a paced Cala key, then cached…${elapsed > 0 ? ` ${elapsed}s` : ""}`
          : `Building the brief…${elapsed > 0 ? ` ${elapsed}s` : ""}`}
      </p>
    </div>
  );
}
