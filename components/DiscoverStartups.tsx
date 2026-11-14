"use client";

import { useEffect, useRef, useState } from "react";
import type { InvestorThesis, RankedStartup } from "@/lib/discover";
import { profileStore, subscribeProfile } from "@/lib/profileStore";
import type { DataMode, Stage } from "@/lib/types";
import { STAGE_LABEL, STAGE_ORDER } from "@/lib/types";
import { btn, Card, Chip, cx, field, Label, ScoreRing, Spinner } from "./ui";

function thesisDefaults() {
  const inv = profileStore.getInvestor();
  if (!inv) {
    return {
      description: "B2B software for logistics and fleet operations in the Nordics",
      stage: "seed" as Stage,
      country: "Finland",
    };
  }
  const sectors = inv.thesisSectors.length ? inv.thesisSectors.join(" and ") : "software";
  const regions = inv.thesisRegions.length ? inv.thesisRegions.join(" + ") : "Europe";
  return {
    description: `${sectors} startups in the ${regions}`,
    stage: inv.thesisStages[0] ?? ("seed" as Stage),
    country: inv.thesisRegions.includes("Nordics") ? "Finland" : "Europe",
  };
}

export default function DiscoverStartups({
  mode,
  onDiligence,
}: {
  mode: DataMode;
  onDiligence: (companyName: string) => void;
}) {
  const defaults = thesisDefaults();
  const [description, setDescription] = useState(defaults.description);
  const [stage, setStage] = useState<Stage>(defaults.stage);
  const [country, setCountry] = useState(defaults.country);

  useEffect(() => {
    return subscribeProfile(() => {
      const next = thesisDefaults();
      setDescription(next.description);
      setStage(next.stage);
      setCountry(next.country);
    });
  }, []);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [thesis, setThesis] = useState<InvestorThesis | null>(null);
  const [ranked, setRanked] = useState<RankedStartup[]>([]);
  const [dataMode, setDataMode] = useState<DataMode | null>(null);
  const acRef = useRef<AbortController | null>(null);

  async function run() {
    if (!description.trim()) return setError("Describe what you want to invest in.");
    setError("");
    setLoading(true);
    setStatus("Starting…");
    setRanked([]);
    setThesis({ description: description.trim(), stage, country });
    setDataMode(mode);

    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;

    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          stage,
          country,
          mode,
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `Discover failed (${res.status})`);
      }

      setTimeout(() => document.getElementById("discover-results")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let ev: {
            type: string;
            message?: string;
            row?: RankedStartup;
            thesis?: InvestorThesis;
            dataMode?: DataMode;
            total?: number;
          };
          try {
            ev = JSON.parse(line.slice(6)) as typeof ev;
          } catch {
            continue;
          }
          if (ev.type === "meta") {
            if (ev.thesis) setThesis(ev.thesis);
            if (ev.dataMode) setDataMode(ev.dataMode);
          } else if (ev.type === "status" && ev.message) {
            setStatus(ev.message);
          } else if (ev.type === "item" && ev.row) {
            const row = ev.row;
            setRanked((prev) => {
              const without = prev.filter((r) => r.company.id !== row.company.id);
              return [...without, row].sort((a, b) => b.score - a.score);
            });
          } else if (ev.type === "error") {
            throw new Error(ev.message ?? "Discover failed.");
          } else if (ev.type === "done") {
            setStatus(ev.total === 0 ? "No matches" : `Done · ${ev.total} startups`);
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const showResults = Boolean(thesis) && (loading || ranked.length > 0 || Boolean(status));

  return (
    <div>
      <Card className="p-5 sm:p-8">
        <div className="mb-5">
          <h2 className="text-lg font-semibold tracking-tight">Your thesis</h2>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Your thesis *</Label>
            <textarea
              className={`${field} mt-1.5 min-h-[88px]`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Early-stage Nordic B2B logistics and climate tech"
              aria-label="Investment thesis"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Preferred stage</Label>
              <select className={`${field} mt-1.5`} value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
                {STAGE_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Focus country</Label>
              <input className={`${field} mt-1.5`} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Finland" />
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-md text-xs text-muted">
            Score = thesis match · sector · stage · geography · recent raise. List updates live, best fit floats up.
          </p>
          <button type="button" className={btn.primary} onClick={() => void run()} disabled={loading}>
            {loading ? <Spinner /> : null}
            Find startups →
          </button>
        </div>
      </Card>

      {error && <div className="mt-6 rounded-2xl border border-bad/30 bg-bad-soft p-4 text-sm text-bad">{error}</div>}

      {showResults && (
        <section id="discover-results" className="mt-10 scroll-mt-24">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <Label>Shortlist</Label>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Startups ranked for your thesis</h2>
              {thesis && (
                <p className="mt-1 text-sm text-muted">
                  For “{thesis.description}” · {STAGE_LABEL[thesis.stage]}
                  {thesis.country ? ` · ${thesis.country}` : ""}.
                </p>
              )}
            </div>
            {loading && (
              <p className="flex items-center gap-2 text-xs text-accent" aria-live="polite">
                <Spinner className="text-accent" />
                {status || "Working…"} · {ranked.length} so far
              </p>
            )}
            {!loading && (
              <p className="text-xs text-muted">
                {status}
                {dataMode ? ` · ${dataMode === "cala" ? "live Cala" : "demo"}` : ""}
                {ranked.length > 0 ? ` · ${ranked.length} startups` : ""}
              </p>
            )}
          </div>

          {ranked.length === 0 && loading && (
            <p className="card-glass rounded-2xl p-6 text-sm text-muted">Searching and scoring — first matches will show here…</p>
          )}
          {ranked.length === 0 && !loading && (
            <p className="card-glass rounded-2xl p-6 text-sm text-muted">No startups matched. Broaden the thesis or try demo data.</p>
          )}

          <ol className="space-y-3">
            {ranked.map((row, i) => (
              <li key={row.company.id} className="animate-[kyi-fade-up_420ms_ease-out]">
                <StartupRow row={row} rank={i + 1} mode={dataMode ?? mode} onDiligence={onDiligence} />
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function StartupRow({
  row,
  rank,
  mode,
  onDiligence,
}: {
  row: RankedStartup;
  rank: number;
  mode: DataMode;
  onDiligence: (name: string) => void;
}) {
  const top = rank === 1;
  return (
    <article className={cx("card-glass rounded-2xl p-4 sm:p-5", top && "border border-accent/30")}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="font-mono text-sm text-muted">{String(rank).padStart(2, "0")}</div>
        <ScoreRing score={row.score} size={56} label="Thesis fit" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold tracking-tight">{row.company.name}</h3>
            {top && <Chip tone="good">Best fit</Chip>}
            {row.company.country && <Chip tone="neutral">{row.company.country}</Chip>}
          </div>
          <p className="mt-1 text-sm text-ink-2">{row.company.description || "No description in the graph."}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            {row.company.sectors.length > 0 && <span>{row.company.sectors.join(" · ")}</span>}
            {row.lastRound && (
              <span>
                Last: {row.lastRound.stageLabel}
                {row.lastRound.amountLabel ? ` · ${row.lastRound.amountLabel}` : ""}
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {row.reasons.slice(0, 5).map((r) => (
              <Chip key={r.label} tone={r.tone}>
                {r.label}
              </Chip>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={btn.secondary} onClick={() => onDiligence(row.company.name)}>
              Diligence this company →
            </button>
            <button
              type="button"
              className={btn.ghost}
              onClick={() => {
                profileStore.upsertWatchlistItem({
                  companyRef: row.company.id || row.company.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                  companyName: row.company.name,
                  dataMode: mode,
                });
              }}
            >
              Save to watchlist
            </button>
          </div>
        </div>
      </div>
      {top && (
        <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
          Why #1 right now: highest score on thesis match, sectors, stage preference and country. Diligence for full round history.
        </p>
      )}
    </article>
  );
}
