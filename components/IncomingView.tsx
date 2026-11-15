"use client";

import { useEffect, useState } from "react";
import { getJSON, postJSON } from "@/lib/client";
import { fmtEur, fmtMonthYear, fmtMonthsAgo } from "@/lib/format";
import { incomingGraph } from "@/lib/graph";
import { LIVE_SAMPLE_COMPANIES, LIVE_SAMPLE_FUND } from "@/lib/presets";
import { profileStore, subscribeProfile } from "@/lib/profileStore";
import type { Company, CompanyBrief, DataMode, Round } from "@/lib/types";
import CompanyPicker from "./CompanyPicker";
import DiscoverStartups from "./DiscoverStartups";
import EvidenceDrawer, { type Evidence } from "./EvidenceDrawer";
import GraphScene from "./GraphScene";
import GraphLoading from "./GraphLoading";
import { btn, Card, Chip, cx, field, Label, ModeBadge, Spinner } from "./ui";

type Tab = "discover" | "diligence";

type Health = { defaultMode: DataMode; calaConfigured: boolean };
type Run =
  | { status: "idle" }
  | { status: "loading"; startedAt: number }
  | { status: "done"; brief: CompanyBrief }
  | { status: "error"; error: string };

export default function IncomingView() {
  const [tab, setTab] = useState<Tab>("discover");
  const [company, setCompany] = useState("");
  const [fund, setFund] = useState("");
  const [modeChoice, setModeChoice] = useState<DataMode | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [run, setRun] = useState<Run>({ status: "idle" });
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [now, setNow] = useState(0);

  const mode: DataMode = modeChoice ?? health?.defaultMode ?? "demo";
  const loading = run.status === "loading";
  const elapsed = run.status === "loading" ? Math.max(0, Math.round((now - run.startedAt) / 1000)) : 0;

  useEffect(() => {
    const ac = new AbortController();
    getJSON<Health>("/api/health", ac.signal)
      .then(setHealth)
      .catch(() => undefined);
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const sync = () => {
      const inv = profileStore.getInvestor();
      if (inv?.firmName) setFund((prev) => prev || inv.firmName || "");
    };
    sync();
    return subscribeProfile(sync);
  }, []);

  useEffect(() => {
    if (run.status !== "loading") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [run.status]);

  async function diligence(over?: { company: string; fund: string; mode: DataMode }) {
    const c = (over?.company ?? company).trim();
    const f = (over?.fund ?? fund).trim();
    const m = over?.mode ?? mode;
    if (!c) return setRun({ status: "error", error: "Search a company first." });
    setNow(Date.now());
    setRun({ status: "loading", startedAt: Date.now() });
    try {
      const brief = await postJSON<CompanyBrief>("/api/incoming", { company: c, fund: f || undefined, mode: m });
      setRun({ status: "done", brief });
      setTimeout(() => document.getElementById("incoming-brief")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setRun({ status: "error", error: (e as Error).message });
    }
  }

  async function tryDemo() {
    setModeChoice("demo");
    setFund("Sisu Seed Partners");
    try {
      const r = await getJSON<{ results: Company[] }>("/api/companies/search?q=a&mode=demo");
      const name = r.results.find((x) => /logistics|fleet|route|truck/i.test(`${x.name} ${x.description}`))?.name ?? r.results[0]?.name;
      if (!name) return setRun({ status: "error", error: "Demo companies are empty." });
      setCompany(name);
      await diligence({ company: name, fund: "Sisu Seed Partners", mode: "demo" });
    } catch (e) {
      setRun({ status: "error", error: (e as Error).message });
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-10 sm:px-6">
      <header className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">Invest</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">What do you want to back?</h1>
          </div>
          <div className="inline-flex rounded-xl border border-line bg-black/30 p-0.5" role="radiogroup" aria-label="Data source">
            {(["cala", "demo"] as DataMode[]).map((m) => {
              const disabled = m === "cala" && health !== null && !health.calaConfigured;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  disabled={disabled}
                  onClick={() => setModeChoice(m)}
                  className={cx(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
                    mode === m ? "bg-white text-black" : "text-muted hover:text-ink",
                  )}
                >
                  {m === "cala" ? "Live" : "Demo"}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 inline-flex rounded-xl border border-line bg-black/30 p-0.5" role="tablist" aria-label="Investor job">
          {(
            [
              ["discover", "By thesis"],
              ["diligence", "One company"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cx(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                tab === id ? "bg-white text-black" : "text-muted hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {tab === "discover" && (
        <DiscoverStartups
          mode={mode}
          onDiligence={(name) => {
            setCompany(name);
            setTab("diligence");
            void diligence({ company: name, fund, mode });
          }}
        />
      )}

      {tab === "diligence" && (
        <>
          <Card className="p-5 sm:p-7">
            <div className="grid gap-6 sm:grid-cols-2">
              <label className="space-y-2">
                <Label>Company</Label>
                <CompanyPicker value={company} onChange={setCompany} mode={mode} />
                {mode === "cala" && (
                  <p className="text-xs text-muted">Try {LIVE_SAMPLE_COMPANIES.slice(0, 3).join(", ")}.</p>
                )}
              </label>
              <label className="space-y-2">
                <Label>Your fund (optional)</Label>
                <input
                  className={field}
                  placeholder={mode === "cala" ? LIVE_SAMPLE_FUND : "Sisu Seed Partners"}
                  value={fund}
                  onChange={(e) => setFund(e.target.value)}
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-line pt-5">
              <button type="button" className={btn.secondary} onClick={() => void tryDemo()} disabled={loading}>
                Demo
              </button>
              <button type="button" className={btn.primary} onClick={() => void diligence()} disabled={loading}>
                {loading ? <Spinner /> : null}
                Diligence →
              </button>
            </div>
          </Card>

          {run.status === "loading" && (
            <GraphLoading
              className="mt-6"
              size="inline"
              title="Walking the graph"
              detail="Diligence on this company"
              elapsed={elapsed}
              lines={["Reading the company", "Following funding rounds", "Checking co-investors", "Sourcing every number"]}
            />
          )}
          {run.status === "error" && <div className="mt-6 rounded-2xl border border-bad/30 bg-bad-soft p-4 text-sm text-bad">{run.error}</div>}
          {run.status === "done" && <Brief brief={run.brief} onEvidence={setEvidence} />}
          {run.status === "done" && (
            <EvidenceDrawer evidence={evidence} mode={run.brief.dataMode} investorId={run.brief.fund?.id ?? ""} onClose={() => setEvidence(null)} />
          )}
        </>
      )}
    </div>
  );
}

function Brief({ brief, onEvidence }: { brief: CompanyBrief; onEvidence: (e: Evidence) => void }) {
  const rounds = (ids: string[]) => ids.map((id) => brief.rounds[id]).filter((x): x is Round => !!x);
  const open = (title: string, subtitle: string, ids: string[]) => onEvidence({ title, subtitle, groups: [{ title: "", rounds: rounds(ids) }] });
  const last = brief.lastRound;

  return (
    <section id="incoming-brief" className="mt-10 scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">{brief.company.name}</h2>
        <ModeBadge mode={brief.dataMode} />
      </div>

      <Card className="overflow-hidden">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="p-5 sm:p-6">
            {brief.company.description && <p className="text-ink-2">{brief.company.description}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {brief.company.sectors.map((s) => (
                <Chip key={s}>{s}</Chip>
              ))}
              {brief.company.country && <Chip>{brief.company.country}</Chip>}
            </div>
            {brief.fund && (
              <p className="mt-4 text-xs text-muted">
                Checked against <span className="text-ink-2">{brief.fund.name}</span>
                {brief.alreadyIn ? " · already on this cap table" : ""}.
              </p>
            )}
            {brief.conflicts[0] && (
              <button
                onClick={() => open(`Already backs ${brief.conflicts[0].companyName}`, brief.conflicts[0].description, brief.conflicts[0].roundIds)}
                className="mt-4 w-full rounded-2xl border border-bad/30 bg-bad-soft p-4 text-left"
              >
                <span className="font-semibold text-bad">Conflict: {brief.conflicts[0].companyName}</span>
                <span className="mt-1 block text-sm text-ink-2">{brief.conflicts[0].description}</span>
              </button>
            )}
          </div>
          <GraphScene model={incomingGraph(brief)} className="no-print h-[220px] rounded-none lg:h-full lg:min-h-[240px]" />
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          q="Last raise"
          big={last ? last.stageLabel : "–"}
          sub={last ? `${fmtMonthYear(last.date)} · ${last.amountLabel ?? fmtMonthsAgo(brief.monthsSinceLastRound)}` : "No rounds"}
          onClick={last ? () => open(`${last.stageLabel}`, fmtMonthYear(last.date), [last.id]) : undefined}
        />
        <Stat q="Raised" big={fmtEur(brief.totalRaisedEur)} sub={`${brief.roundCount} rounds`} />
        <Stat
          q="Last activity"
          big={fmtMonthsAgo(brief.monthsSinceLastRound)}
          sub={brief.monthsSinceLastRound != null && brief.monthsSinceLastRound >= 18 ? "Long gap" : "Since last announcement"}
        />
        <Stat
          q="Who leads"
          big={brief.capTable.find((r) => r.leads > 0)?.investorName ?? "–"}
          sub={brief.capTable[0] ? `${brief.capTable.length} on cap table` : "Lead not marked"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <Label>Ask in the room</Label>
          <ul className="mt-4 space-y-3">
            {brief.talkingPoints.map((t, i) => (
              <li key={i} className="flex gap-3 text-sm text-ink-2">
                <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", t.tone === "bad" ? "bg-bad" : t.tone === "warn" ? "bg-warn" : t.tone === "good" ? "bg-good" : "bg-muted")} />
                <span>
                  {t.text}{" "}
                  {t.roundIds.length > 0 && (
                    <button className="text-xs text-accent hover:underline" onClick={() => open("Evidence", t.text, t.roundIds)}>
                      evidence
                    </button>
                  )}
                </span>
              </li>
            ))}
            {brief.talkingPoints.length === 0 && <li className="text-sm text-muted">Not enough data yet.</li>}
          </ul>
        </Card>
        <Card className="p-5">
          <Label>Cap table</Label>
          {brief.capTable.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No investors attached.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {brief.capTable.slice(0, 8).map((row) => (
                <li key={row.investorId}>
                  <button className="flex w-full items-center justify-between gap-3 text-left text-sm hover:text-accent" onClick={() => open(row.investorName, `${row.rounds} rounds`, row.roundIds)}>
                    <span className="truncate font-medium">
                      {row.investorName}
                      {row.leads > 0 && <Chip tone="good" className="ml-2">Lead</Chip>}
                      {brief.fund && (row.investorId === brief.fund.id || row.investorName === brief.fund.name) && (
                        <Chip className="ml-2">You</Chip>
                      )}
                    </span>
                    <span className="tabular text-xs text-muted">{row.rounds}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </section>
  );
}

function Stat({ q, big, sub, onClick }: { q: string; big: string; sub: string; onClick?: () => void }) {
  const inner = (
    <>
      <Label>{q}</Label>
      <div className="mt-2 truncate text-xl font-semibold tracking-tight">{big}</div>
      <div className="mt-1 text-xs text-muted">{sub}</div>
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="card-glass rounded-2xl p-4 text-left transition hover:border-accent/40">
      {inner}
    </button>
  ) : (
    <div className="card-glass rounded-2xl p-4">{inner}</div>
  );
}
