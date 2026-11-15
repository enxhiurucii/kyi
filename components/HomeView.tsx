"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { compareHref, getJSON, parseInvestorList, postJSON } from "@/lib/client";
import { companyToStartup, profileStore, subscribeProfile } from "@/lib/profileStore";
import type { CompanyProfile } from "@/lib/profiles/types";
import { DEMO_INVESTORS, DEMO_STARTUP, LIVE_SAMPLE_INVESTORS } from "@/lib/presets";
import type { DataMode, RankResponse, Stage, Startup } from "@/lib/types";
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/types";
import CountryMultiSelect from "./CountryMultiSelect";
import InvestorLookup from "./InvestorLookup";
import InvestorPicker from "./InvestorPicker";
import InterestedInvestors from "./InterestedInvestors";
import RankedList from "./RankedList";
import { SCOUT_HANDOFF_KEY, type ScoutHandoff } from "@/lib/scout/handoff";
import GraphLoading from "./GraphLoading";
import { btn, Card, cx, field, FitPage, Label, ModeBadge, Spinner } from "./ui";

type Health = { defaultMode: DataMode; calaConfigured: boolean; aiEnabled?: boolean };
type RunState =
  | { status: "idle" }
  | { status: "loading"; startedAt: number; count: number }
  | { status: "done"; data: RankResponse; startup: Startup }
  | { status: "error"; error: string };

export default function HomeView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [startup, setStartup] = useState<Startup>({ description: "", stage: "seed", country: "Finland" });
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [investorsText, setInvestorsText] = useState("");
  const [modeChoice, setModeChoice] = useState<DataMode | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [run, setRun] = useState<RunState>({ status: "idle" });
  const [selected, setSelected] = useState<string[]>([]);
  const [now, setNow] = useState(0);
  const [prefilled, setPrefilled] = useState(false);
  const scoutHandoffDone = useRef(false);
  const demoDone = useRef(false);

  const modeFromUrl = searchParams.get("mode");
  const mode: DataMode =
    modeChoice ??
    (modeFromUrl === "demo" || modeFromUrl === "cala" ? modeFromUrl : null) ??
    health?.defaultMode ??
    "demo";

  useEffect(() => {
    const ac = new AbortController();
    getJSON<Health>("/api/health", ac.signal)
      .then(setHealth)
      .catch(() => undefined);
    return () => ac.abort();
  }, []);

  useEffect(() => {
    function syncFromStore() {
      const c = profileStore.getCompany();
      setCompany(c);
      const fromCompany = companyToStartup(c);
      if (fromCompany) {
        setStartup(fromCompany);
        setPrefilled(true);
      } else {
        setPrefilled(false);
      }
      const listId = profileStore.getActiveListId();
      const list = profileStore.getLists().find((l) => l.id === listId) ?? profileStore.getLists()[0];
      if (list?.items.length) {
        setInvestorsText(list.items.map((i) => i.investorName).join("\n"));
      }
    }
    syncFromStore();
    return subscribeProfile(syncFromStore);
  }, []);

  useEffect(() => {
    if (run.status !== "loading") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [run.status]);

  async function check(over?: { startup: Startup; investors: string[]; mode: DataMode }) {
    const s = over?.startup ?? startup;
    const names = over?.investors ?? parseInvestorList(investorsText);
    const m = over?.mode ?? mode;
    if (!s.description.trim()) return setRun({ status: "error", error: "Describe your startup in one line first." });
    if (names.length === 0) return setRun({ status: "error", error: "Add at least one investor." });
    setSelected([]);
    setNow(Date.now());
    setRun({ status: "loading", startedAt: Date.now(), count: names.length });
    try {
      const data = await postJSON<RankResponse>("/api/rank", {
        investors: names,
        startup: s,
        company: company ?? profileStore.getCompany(),
        mode: m,
      });
      setRun({ status: "done", data, startup: s });
    } catch (e) {
      setRun({ status: "error", error: (e as Error).message });
    }
  }

  useEffect(() => {
    if (scoutHandoffDone.current) return;
    if (searchParams.get("fromScout") !== "1") return;
    scoutHandoffDone.current = true;
    let handoff: ScoutHandoff | null = null;
    try {
      const raw = sessionStorage.getItem(SCOUT_HANDOFF_KEY);
      if (raw) handoff = JSON.parse(raw) as ScoutHandoff;
      sessionStorage.removeItem(SCOUT_HANDOFF_KEY);
    } catch {
      handoff = null;
    }
    router.replace("/raise");
    if (!handoff?.investors?.length) return;
    const payload = handoff;
    queueMicrotask(() => {
      setStartup(payload.startup);
      setInvestorsText(payload.investors.join("\n"));
      setModeChoice(payload.mode);
      if (payload.autoRank) {
        void check({ startup: payload.startup, investors: payload.investors, mode: payload.mode });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  // Deep link: /raise?demo=1
  useEffect(() => {
    if (demoDone.current) return;
    if (searchParams.get("demo") !== "1") return;
    demoDone.current = true;
    queueMicrotask(() => {
      profileStore.loadDemoProfile();
      setStartup(DEMO_STARTUP);
      setInvestorsText(DEMO_INVESTORS.join("\n"));
      setModeChoice("demo");
      setPrefilled(true);
      void check({ startup: DEMO_STARTUP, investors: DEMO_INVESTORS, mode: "demo" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function tryDemo() {
    setStartup(DEMO_STARTUP);
    setInvestorsText(DEMO_INVESTORS.join("\n"));
    setModeChoice("demo");
    void check({ startup: DEMO_STARTUP, investors: DEMO_INVESTORS, mode: "demo" });
  }

  const toggle = (id: string) =>
    setSelected((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : xs.length >= 3 ? xs : [...xs, id]));
  const loading = run.status === "loading";
  const elapsed = run.status === "loading" ? Math.max(0, Math.round((now - run.startedAt) / 1000)) : 0;

  const form = (
    <div className="flex min-h-0 min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">Raise</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight fit:text-base">Who are you meeting?</h1>
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
                title={disabled ? "Add CALA_API_KEY to .env.local" : undefined}
                onClick={() => setModeChoice(m)}
                className={cx(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
                  mode === m ? "bg-white text-black" : "text-muted hover:text-ink",
                )}
              >
                {m === "cala" ? "Live" : "Demo"}
              </button>
            );
          })}
        </div>
      </div>

      {/* fit:hidden on normal desktop; .present-show overrides in present mode for demo capture */}
      <div className="fit:hidden present-show">
        <InterestedInvestors mode={mode} />
      </div>

      <Card id="brief" className="min-h-0 p-4 fit:flex fit:flex-1 fit:flex-col fit:overflow-hidden">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Your startup</Label>
            {prefilled && company ? (
              <Link href="/profile" className="text-[11px] text-accent hover:underline">
                {company.name}
              </Link>
            ) : (
              <Link href="/onboarding" className="text-[11px] text-muted hover:text-ink">
                Profile
              </Link>
            )}
          </div>
          <textarea
            className={`${field} min-h-[72px] fit:min-h-[56px] fit:max-h-[72px]`}
            placeholder="What you build in one line"
            value={startup.description}
            onChange={(e) => setStartup({ ...startup, description: e.target.value })}
            aria-label="Describe your startup"
          />
          <div className="grid gap-2 sm:grid-cols-2">
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
            <div className="space-y-1 text-xs text-muted sm:col-span-1">
              <span>Markets</span>
              <CountryMultiSelect value={startup.country} onChange={(country) => setStartup({ ...startup, country })} />
            </div>
          </div>
        </div>
        <div className="mt-3 min-h-0 flex-1 space-y-2 fit:flex fit:flex-col">
          <div className="flex items-center justify-between">
            <Label>Investors</Label>
            <button
              type="button"
              className={btn.ghost}
              onClick={() => setInvestorsText((mode === "cala" ? LIVE_SAMPLE_INVESTORS : DEMO_INVESTORS).join("\n"))}
            >
              Sample
            </button>
          </div>
          <div className="min-h-0 fit:flex-1 fit:overflow-hidden">
            <InvestorPicker value={investorsText} onChange={setInvestorsText} mode={mode} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          {health?.aiEnabled ? (
            <Link href="/scout?for=founder" className="text-xs text-accent hover:underline">
              Find investors for me →
            </Link>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={btn.secondary} onClick={tryDemo} disabled={loading}>
              Demo
            </button>
            <button type="button" className={btn.primary} onClick={() => void check()} disabled={loading}>
              {loading ? <Spinner /> : null}
              Rank →
            </button>
          </div>
        </div>
      </Card>

      <div className="fit:hidden">
        <Label>Or one fund</Label>
        <div className="mt-2">
          <InvestorLookup mode={mode} />
        </div>
      </div>
    </div>
  );

  const results = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {run.status === "loading" && (
        <GraphLoading
          className="mb-3"
          size="inline"
          title={`Scoring ${run.count} investors`}
          detail={mode === "cala" ? "Live Cala · first run can take a minute, then cached" : "Ranking by fit on the demo graph"}
          elapsed={elapsed}
          lines={["Walking each investor", "Checking stage & sector fit", "Scoring leads & follow-on", "Flagging conflicts"]}
        />
      )}
      {run.status === "error" && <div className="mb-3 rounded-2xl border border-bad/30 bg-bad-soft p-3 text-sm text-bad">{run.error}</div>}

      {run.status === "done" ? (
        <section id="results" className="flex min-h-0 flex-1 flex-col">
          <div className="mb-2 flex shrink-0 flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold tracking-tight fit:text-base">Ranked for you</h2>
              <p className="text-xs text-muted">
                {STAGE_LABEL[run.startup.stage]}
                {run.startup.country ? ` · ${run.startup.country}` : ""}
              </p>
            </div>
            <ModeBadge mode={run.data.dataMode} />
          </div>
          <div className="min-h-0 flex-1 overflow-auto fit:fit-scroll">
            {run.data.ranked.length > 0 ? (
              <RankedList
                compact
                ranked={run.data.ranked}
                startup={run.startup}
                mode={run.data.dataMode}
                selected={selected}
                onToggle={toggle}
              />
            ) : (
              <p className="text-sm text-muted">No investors could be scored.</p>
            )}
          </div>
          {selected.length >= 2 ? (
            <div className="no-print mt-2 flex shrink-0 items-center justify-between gap-2 rounded-2xl border border-line bg-black/40 px-3 py-2">
              <span className="text-xs text-ink-2">{selected.length} funds selected</span>
              <button
                type="button"
                className={btn.primary}
                onClick={() => router.push(compareHref(selected, run.startup, run.data.dataMode))}
              >
                Compare →
              </button>
            </div>
          ) : null}
        </section>
      ) : (
        <Card className="flex flex-1 items-center justify-center p-6 text-sm text-muted">
          Rank investors to fill this panel.
        </Card>
      )}
    </div>
  );

  return (
    <FitPage>
      <div className="grid min-h-0 min-w-0 gap-4 fit:h-full fit:grid-cols-[minmax(280px,400px)_1fr] fit:gap-3">
        <div className="min-h-0 min-w-0 fit:overflow-hidden fit:flex fit:flex-col">{form}</div>
        <div className="min-h-0 min-w-0 fit:overflow-hidden fit:flex fit:flex-col">{results}</div>
      </div>

      {/* Mobile compare dock */}
      {run.status === "done" && selected.length >= 2 && (
        <div className="no-print fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 fit:hidden">
          <div className="score-panel flex items-center gap-3 rounded-2xl border border-line px-4 py-3 shadow-2xl">
            <span className="text-sm text-ink-2">{selected.length} funds selected</span>
            <button
              type="button"
              className={btn.primary}
              onClick={() => router.push(compareHref(selected, run.startup, run.data.dataMode))}
            >
              Compare →
            </button>
          </div>
        </div>
      )}
    </FitPage>
  );
}
