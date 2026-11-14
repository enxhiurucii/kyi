"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { companyHref, getJSON, postJSON, reportHref } from "@/lib/client";
import { companyToStartup, profileStore, subscribeProfile } from "@/lib/profileStore";
import { DEMO_STARTUP } from "@/lib/presets";
import { SCOUT_HANDOFF_KEY, type ScoutHandoff } from "@/lib/scout/handoff";
import type { ScoutPlan, ScoutPlanItem } from "@/lib/scout/schema";
import type { CompanyProfile, FounderProfile } from "@/lib/profiles/types";
import type { DataMode, InvestorReport, Round, Stage, Startup, Thesis } from "@/lib/types";
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/types";
import CountryMultiSelect from "./CountryMultiSelect";
import EvidenceDrawer, { type Evidence } from "./EvidenceDrawer";
import { btn, Card, Chip, cx, field, FitPage, Label, ModeBadge, ScoreRing, Spinner } from "./ui";

type Step = { icon: string; text: string };
type Health = { defaultMode: DataMode; calaConfigured: boolean; aiEnabled?: boolean };

type RunState =
  | { status: "idle" }
  | { status: "running"; steps: Step[]; startedAt: number }
  | { status: "done"; steps: Step[]; plan: ScoutPlan; startedAt: number; finishedAt: number }
  | { status: "error"; steps: Step[]; error: string };

const DEMO_THESIS: Thesis = {
  sectors: ["logistics", "mobility"],
  stages: ["pre-seed", "seed"],
  regions: ["Nordics", "Baltics"],
  ticketMinEur: 500_000,
  ticketMaxEur: 3_000_000,
};

function wordCount(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function thesisFromInvestor(): Thesis {
  const inv = profileStore.getInvestor();
  if (!inv) return DEMO_THESIS;
  return {
    sectors: inv.thesisSectors.length ? inv.thesisSectors : DEMO_THESIS.sectors,
    stages: inv.thesisStages.length ? inv.thesisStages : DEMO_THESIS.stages,
    regions: inv.thesisRegions.length ? inv.thesisRegions : DEMO_THESIS.regions,
    ticketMinEur: inv.ticketMinEur ?? DEMO_THESIS.ticketMinEur,
    ticketMaxEur: inv.ticketMaxEur ?? DEMO_THESIS.ticketMaxEur,
  };
}

export default function ScoutView() {
  const router = useRouter();
  const sp = useSearchParams();
  const forInvestor = sp.get("for") === "investor";

  const [startup, setStartup] = useState<Startup>({ description: "", stage: "seed", country: "Finland" });
  const [thesis, setThesis] = useState<Thesis>(DEMO_THESIS);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [founder, setFounder] = useState<FounderProfile | null>(null);
  const [modeChoice, setModeChoice] = useState<DataMode | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [evidenceInvestorId, setEvidenceInvestorId] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [draftOpen, setDraftOpen] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const acRef = useRef<AbortController | null>(null);
  const demoDone = useRef(false);

  const aiEnabled = health?.aiEnabled === true;
  // Without Anthropic, force demo — Live Scout stays hidden.
  const mode: DataMode = !aiEnabled && health ? "demo" : modeChoice ?? health?.defaultMode ?? "demo";
  const canRun = mode === "demo" || aiEnabled;

  useEffect(() => {
    const ac = new AbortController();
    getJSON<Health>("/api/health", ac.signal)
      .then(setHealth)
      .catch(() => setHealth({ defaultMode: "demo", calaConfigured: false, aiEnabled: false }));
    return () => ac.abort();
  }, []);

  useEffect(() => {
    function sync() {
      const c = profileStore.getCompany();
      const f = profileStore.getFounder();
      setCompany(c);
      setFounder(f);
      if (forInvestor) {
        setThesis(thesisFromInvestor());
        return;
      }
      const fromCompany = companyToStartup(c);
      if (fromCompany) setStartup(fromCompany);
    }
    sync();
    return subscribeProfile(sync);
  }, [forInvestor]);

  useEffect(() => {
    if (run.status !== "running") return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [run.status]);

  useEffect(() => {
    if (demoDone.current) return;
    if (sp.get("demo") !== "1") return;
    demoDone.current = true;
    queueMicrotask(() => {
      setModeChoice("demo");
      tryDemo();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  async function runScout(over?: { startup?: Startup; thesis?: Thesis; mode: DataMode }) {
    const m = over?.mode ?? mode;
    const s = over?.startup ?? startup;
    const th = over?.thesis ?? thesis;

    if (forInvestor) {
      if (!th.sectors.length && !th.stages.length && !th.regions.length) {
        setRun({ status: "error", steps: [], error: "Set thesis sectors, stages, or regions first." });
        return;
      }
    } else if (!s.description.trim()) {
      setRun({ status: "error", steps: [], error: "Describe your startup in one line first." });
      return;
    }

    if (m !== "demo" && !aiEnabled) {
      setRun({ status: "error", steps: [], error: "Live Scout needs ANTHROPIC_API_KEY." });
      return;
    }

    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    const startedAt = Date.now();
    setNow(startedAt);
    let steps: Step[] = [];
    setRun({ status: "running", steps, startedAt });
    setEvidence(null);

    try {
      const body = forInvestor
        ? { for: "investor" as const, thesis: th, mode: m }
        : {
            for: "founder" as const,
            startup: s,
            mode: m,
            founder: founder ?? profileStore.getFounder(),
            company: company ?? profileStore.getCompany(),
          };

      const res = await fetch("/api/scout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `Scout failed (${res.status})`);
      }
      if (!res.body) throw new Error("No stream from scout.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let plan: ScoutPlan | null = null;
      let errMsg = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let ev: { type?: string; icon?: string; text?: string; plan?: ScoutPlan; message?: string };
          try {
            ev = JSON.parse(line.slice(6)) as typeof ev;
          } catch {
            continue;
          }
          if (ev.type === "step" && ev.text) {
            steps = [...steps, { icon: ev.icon ?? "·", text: ev.text }];
            setRun({ status: "running", steps, startedAt });
          } else if (ev.type === "plan" && ev.plan) {
            plan = ev.plan;
          } else if (ev.type === "error" && ev.message) {
            errMsg = ev.message;
          }
        }
      }

      if (plan) {
        setRun({ status: "done", steps, plan, startedAt, finishedAt: Date.now() });
        setTimeout(() => document.getElementById("scout-plan")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
      } else {
        setRun({ status: "error", steps, error: errMsg || "Scout finished without a plan." });
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setRun({
        status: "error",
        steps,
        error: (e as Error).message || "Scout failed.",
      });
    }
  }

  function tryDemo() {
    setModeChoice("demo");
    if (forInvestor) {
      setThesis(DEMO_THESIS);
      void runScout({ thesis: DEMO_THESIS, mode: "demo" });
    } else {
      setStartup(DEMO_STARTUP);
      void runScout({ startup: DEMO_STARTUP, mode: "demo" });
    }
  }

  function addAllToShortlist(plan: ScoutPlan) {
    const names = plan.items.map((t) => t.name);
    const handoff: ScoutHandoff = { investors: names, startup, mode, autoRank: true };
    try {
      sessionStorage.setItem(SCOUT_HANDOFF_KEY, JSON.stringify(handoff));
    } catch {
      /* ignore */
    }
    let listId = profileStore.getActiveListId();
    if (!listId) {
      const id = crypto.randomUUID();
      profileStore.saveList({ id, name: "Scout shortlist", createdAt: new Date().toISOString(), items: [] });
      profileStore.setActiveListId(id);
      listId = id;
    }
    for (const item of plan.items) {
      profileStore.upsertItem(listId, {
        investorName: item.name,
        investorRef: (item.id ?? item.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        dataMode: mode,
        status: "to_contact",
        lastFitScore: item.score,
      });
    }
    router.push("/raise?fromScout=1");
  }

  function addAllToWatchlist(plan: ScoutPlan) {
    for (const item of plan.items) {
      profileStore.upsertWatchlistItem({
        companyRef: item.id ?? item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        companyName: item.name,
        dataMode: mode,
        note: item.why[0],
      });
    }
    router.push("/watchlist");
  }

  async function openEvidence(item: ScoutPlanItem) {
    const ids = item.evidenceRoundIds ?? [];
    if (forInvestor) {
      setEvidence({
        title: item.name,
        subtitle: ids.length ? `Cited rounds: ${ids.join(", ")}` : "Open the company card for full sources.",
        groups: [{ title: "", rounds: [] }],
      });
      setEvidenceInvestorId("");
      return;
    }
    if (ids.length === 0) {
      setEvidence({
        title: item.name,
        subtitle: "No round ids cited — open the full report card for sources.",
        groups: [{ title: "", rounds: [] }],
      });
      setEvidenceInvestorId(item.id ?? item.name);
      return;
    }
    try {
      const report = await postJSON<InvestorReport>("/api/report", {
        investor: item.id || item.name,
        startup,
        company: profileStore.getCompany(),
        mode,
        depth: "quick",
      });
      const rounds = ids.map((id) => report.rounds[id]).filter((r): r is Round => !!r);
      setEvidenceInvestorId(report.investor.id);
      setEvidence({
        title: item.name,
        subtitle: "Cited lead rounds",
        groups: [{ title: "", rounds }],
      });
    } catch (e) {
      setEvidence({
        title: item.name,
        subtitle: (e as Error).message,
        groups: [{ title: "", rounds: [] }],
      });
      setEvidenceInvestorId(item.id ?? item.name);
    }
  }

  async function copyMessage(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* ignore */
    }
  }

  const loading = run.status === "running";
  const elapsed =
    run.status === "running"
      ? Math.max(0, Math.round((now - run.startedAt) / 1000))
      : run.status === "done"
        ? Math.max(0, Math.round((run.finishedAt - run.startedAt) / 1000))
        : 0;

  function renderPlanItem(item: ScoutPlanItem, idx: number, compact?: boolean) {
    const whyShown = item.why.slice(0, 3);
    const draft = item.draftMessage;
    const draftLong = draft ? wordCount(draft) > 45 : false;
    return (
      <li
        key={`${item.name}-${idx}`}
        className={cx(
          "score-panel rounded-2xl border border-line p-5",
          compact && "fit:p-3 fit:text-xs",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-4 fit:gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs tabular text-muted">#{idx + 1}</span>
              <h3 className="truncate text-lg font-semibold tracking-tight fit:text-sm">{item.name}</h3>
              {item.risk ? (
                <Chip tone="bad">{item.risk}</Chip>
              ) : forInvestor ? null : (
                <Chip tone="good">No conflict</Chip>
              )}
            </div>
            <ul className="mt-3 space-y-2 text-sm text-ink-2 fit:mt-2 fit:space-y-1 fit:text-xs">
              {whyShown.map((w) => (
                <li key={w} className="flex flex-wrap items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  <span className="min-w-0 flex-1 line-clamp-2">{w}</span>
                  {(item.evidenceRoundIds?.length ?? 0) > 0 ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[10px] font-medium text-muted hover:text-ink"
                      onClick={() => void openEvidence(item)}
                    >
                      Evidence
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          <ScoreRing score={Math.round(item.score)} size={compact ? 44 : 56} label={forInvestor ? "Raise" : "Fit"} />
        </div>

        {draft ? (
          <div className="mt-4 rounded-xl border border-line bg-black/25 p-3 fit:mt-2 fit:p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Label>Draft · {wordCount(draft)} words</Label>
              <div className="flex gap-1">
                {draftLong ? (
                  <button type="button" className={`${btn.ghost} hidden fit:inline-flex`} onClick={() => setDraftOpen(item.name)}>
                    Open
                  </button>
                ) : null}
                <button type="button" className={btn.ghost} onClick={() => void copyMessage(draft, item.name)}>
                  {copied === item.name ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
            <p className={cx("whitespace-pre-wrap text-sm text-ink-2 fit:text-xs", draftLong && "fit:hidden")}>{draft}</p>
            {draftLong ? (
              <button type="button" className={`${btn.ghost} mt-1 text-xs fit:hidden`} onClick={() => setDraftOpen(item.name)}>
                Read full draft
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2 fit:mt-2">
          {forInvestor ? (
            <Link href={companyHref(item.id || item.name, thesis, mode)} className={btn.secondary}>
              Open company card
            </Link>
          ) : (
            <Link href={reportHref(item.id || item.name, startup, mode)} className={btn.secondary}>
              Open report card
            </Link>
          )}
          {(item.evidenceRoundIds?.length ?? 0) > 0 ? (
            <button type="button" className={btn.ghost} onClick={() => void openEvidence(item)}>
              View evidence
            </button>
          ) : null}
        </div>
      </li>
    );
  }

  const modeToggle = (
    <div className="inline-flex rounded-xl border border-line bg-black/30 p-0.5" role="radiogroup" aria-label="Data source">
      {(["cala", "demo"] as DataMode[]).map((m) => {
        const disabled = m === "cala" && health !== null && (!health.calaConfigured || !aiEnabled);
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            disabled={disabled}
            title={
              disabled
                ? !health?.calaConfigured
                  ? "Add CALA_API_KEY to .env.local"
                  : "Add ANTHROPIC_API_KEY to .env.local"
                : undefined
            }
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
  );

  const inputForm = (
    <Card className="min-h-0 shrink-0 p-5 sm:p-7 fit:flex fit:flex-col fit:overflow-hidden fit:p-4">
      {forInvestor ? (
        <div className="space-y-3 fit:space-y-2">
          <Label>Your thesis</Label>
          <textarea
            className={`${field} min-h-[72px] fit:min-h-[56px] fit:max-h-[72px]`}
            value={`${thesis.sectors.join(", ")} · ${thesis.stages.map((s) => STAGE_LABEL[s] ?? s).join(", ")} · ${thesis.regions.join(", ")}`}
            readOnly
            aria-label="Thesis summary"
          />
          <p className="text-xs text-muted">
            Edit on{" "}
            <Link href="/invest" className="text-accent hover:underline">
              Invest
            </Link>
            . Ticket{" "}
            {thesis.ticketMinEur != null || thesis.ticketMaxEur != null
              ? `${thesis.ticketMinEur?.toLocaleString() ?? "?"} – ${thesis.ticketMaxEur?.toLocaleString() ?? "?"} €`
              : "open"}
            .
          </p>
          <div className="flex flex-wrap gap-1.5">
            {thesis.sectors.map((s) => (
              <Chip key={s} tone="neutral">
                {s}
              </Chip>
            ))}
            {thesis.regions.map((r) => (
              <Chip key={r} tone="neutral">
                {r}
              </Chip>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3 fit:space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Your startup</Label>
            {company?.name ? (
              <Link href="/profile" className="text-[11px] text-accent hover:underline">
                {company.name}
              </Link>
            ) : null}
          </div>
          <textarea
            className={`${field} min-h-[88px] fit:min-h-[56px] fit:max-h-[72px]`}
            placeholder="What you build in one line"
            value={startup.description}
            onChange={(e) => setStartup({ ...startup, description: e.target.value })}
            aria-label="Describe your startup"
          />
          <div className="grid gap-3 sm:grid-cols-2 fit:gap-2">
            <label className="space-y-1 text-xs text-muted">
              <span>Raising</span>
              <select className={field} value={startup.stage} onChange={(e) => setStartup({ ...startup, stage: e.target.value as Stage })}>
                {STAGE_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-1 text-xs text-muted sm:col-span-2 fit:col-span-1">
              <span>Markets</span>
              <CountryMultiSelect value={startup.country} onChange={(country) => setStartup({ ...startup, country })} />
            </div>
          </div>
        </div>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-5 fit:mt-3 fit:pt-3">
        <button type="button" className={btn.secondary} onClick={tryDemo} disabled={loading}>
          Demo
        </button>
        <button type="button" className={btn.primary} onClick={() => void runScout()} disabled={loading || !canRun}>
          {loading ? <Spinner /> : null}
          Scout →
        </button>
      </div>
    </Card>
  );

  const stepLog =
    run.status === "running" || (run.status === "done" && run.steps.length > 0) || run.status === "error" ? (
      <div data-testid="scout-step-log" className="score-panel min-h-0 rounded-2xl border border-line p-4 fit:flex fit:flex-1 fit:flex-col fit:overflow-hidden" aria-live="polite">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-2 fit:mb-2">
          <Label>Live log</Label>
          <span className="tabular text-xs text-muted">
            {run.status === "running" ? (
              <>
                <Spinner className="mr-1 inline text-accent" /> {elapsed}s · {run.steps.length} steps
              </>
            ) : (
              <>
                {elapsed}s · {run.steps.length} steps
              </>
            )}
          </span>
        </div>
        <ul className="max-h-56 space-y-1.5 overflow-y-auto text-sm fit:min-h-0 fit:max-h-none fit:flex-1 fit:fit-scroll">
          {run.steps.map((s, i) => (
            <li key={`${i}-${s.text}`} className="flex gap-2 text-ink-2">
              <span className="w-5 shrink-0 text-center" aria-hidden>
                {s.icon}
              </span>
              <span>{s.text}</span>
            </li>
          ))}
          {run.status === "running" && run.steps.length === 0 && <li className="text-muted">Starting…</li>}
        </ul>
      </div>
    ) : null;

  const draftItem = run.status === "done" ? run.plan.items.find((it) => it.name === draftOpen) : null;

  return (
    <FitPage>
      <header className="mb-6 shrink-0 fit:mb-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">
              {forInvestor ? "Startup Scout" : "Investor Scout"}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight fit:text-lg">
              {forInvestor ? "Find startups for my thesis" : "Find investors for my startup"}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted fit:mt-1 fit:text-xs">
              {forInvestor
                ? "Thesis in — five companies to watch, with raise-soon reasons and risks."
                : "One sentence in — five recent lead investors in similar startups, with sources."}
              {mode === "cala" ? " Live Cala is rate-limited (~10 req/min); Demo finishes in seconds." : null}
            </p>
          </div>
          {modeToggle}
        </div>
      </header>

      <div className="grid min-h-0 min-w-0 gap-6 fit:flex-1 fit:grid-cols-[420px_1fr] fit:gap-3">
        <div className="flex min-h-0 min-w-0 flex-col gap-4 fit:overflow-hidden fit:gap-2">
          {inputForm}
          {stepLog}
        </div>

        <div className="min-h-0 min-w-0 fit:flex fit:flex-col fit:overflow-hidden">
          {run.status === "error" && (
            <div className="rounded-2xl border border-bad/30 bg-bad-soft p-4 text-sm text-bad">{run.error}</div>
          )}

          {run.status === "done" ? (
            <section id="scout-plan" data-testid="scout-result" className="flex min-h-0 flex-1 flex-col fit:overflow-hidden">
              <div className="mb-5 flex shrink-0 flex-wrap items-end justify-between gap-3 fit:mb-2">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight fit:text-base">
                    {forInvestor ? "Your watchlist plan" : "Your investor plan"}
                  </h2>
                  {run.plan.summary ? <p className="mt-1 text-sm text-muted fit:text-xs">{run.plan.summary}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <ModeBadge mode={mode} />
                  {forInvestor ? (
                    <button type="button" className={btn.primary} onClick={() => addAllToWatchlist(run.plan)}>
                      Add all to watchlist
                    </button>
                  ) : (
                    <button type="button" className={btn.primary} onClick={() => addAllToShortlist(run.plan)}>
                      Add all to my shortlist
                    </button>
                  )}
                </div>
              </div>

              <ol className="space-y-4 fit:min-h-0 fit:flex-1 fit:grid fit:grid-cols-3 fit:gap-2 fit:space-y-0 fit:overflow-auto fit:fit-scroll">
                {run.plan.items.map((item, idx) => renderPlanItem(item, idx, true))}
              </ol>
            </section>
          ) : (
            <Card className="flex flex-1 items-center justify-center p-6 text-sm text-muted fit:min-h-0">
              Run Scout to see ranked results here.
            </Card>
          )}
        </div>
      </div>

      {draftOpen && draftItem?.draftMessage ? (
        <div className="no-print fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog" aria-modal>
          <Card className="max-h-[80vh] w-full max-w-lg overflow-auto p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Label>
                Draft to {draftItem.name} · {wordCount(draftItem.draftMessage)} words
              </Label>
              <button type="button" className={btn.ghost} onClick={() => setDraftOpen(null)}>
                Close
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink-2">{draftItem.draftMessage}</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className={btn.secondary} onClick={() => void copyMessage(draftItem.draftMessage!, draftItem.name)}>
                {copied === draftItem.name ? "Copied" : "Copy"}
              </button>
            </div>
          </Card>
        </div>
      ) : null}

      <EvidenceDrawer evidence={evidence} mode={mode} investorId={evidenceInvestorId} onClose={() => setEvidence(null)} />
    </FitPage>
  );
}
