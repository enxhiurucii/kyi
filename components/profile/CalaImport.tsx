"use client";

import { useEffect, useState } from "react";
import { ApiError, getJSON, postJSON } from "@/lib/client";
import type { CompanyProfile, FounderProfile, ImportedFact } from "@/lib/profiles/types";
import type { DataMode } from "@/lib/types";
import GraphLoading, { SearchPulse } from "@/components/GraphLoading";
import { btn, Chip, cx, field, Label } from "@/components/ui";

type Kind = "founder" | "company";

interface SearchHit {
  id: string;
  name: string;
  description?: string;
  entityType: string;
}

interface Props {
  kind: Kind;
  /** Seed the search box (e.g. typed name). */
  queryHint?: string;
  mode?: DataMode;
  onApplied: (payload: {
    founder?: Partial<FounderProfile>;
    company?: Partial<CompanyProfile>;
    facts: ImportedFact[];
  }) => void;
  onManual: () => void;
}

export default function CalaImport({ kind, queryHint = "", mode: modeProp, onApplied, onManual }: Props) {
  const [mode, setMode] = useState<DataMode>(modeProp ?? "demo");
  const [q, setQ] = useState(() => queryHint);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [picked, setPicked] = useState<SearchHit | null>(null);
  const [facts, setFacts] = useState<ImportedFact[]>([]);
  const [prefill, setPrefill] = useState<Partial<FounderProfile> | Partial<CompanyProfile> | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  const [dataMode, setDataMode] = useState<DataMode | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    getJSON<{ defaultMode: DataMode; calaConfigured: boolean }>("/api/health", ac.signal)
      .then((h) => {
        if (!modeProp) setMode(h.defaultMode);
      })
      .catch(() => undefined);
    return () => ac.abort();
  }, [modeProp]);

  async function search() {
    setError("");
    setSearched(true);
    setPicked(null);
    setPrefill(null);
    setFacts([]);
    setConfirm(false);
    if (q.trim().length < 2) {
      setResults([]);
      setError("Type at least 2 characters.");
      return;
    }
    setSearching(true);
    try {
      const path =
        kind === "founder"
          ? `/api/profiles/search-people?q=${encodeURIComponent(q.trim())}&mode=${mode}`
          : `/api/profiles/search-companies?q=${encodeURIComponent(q.trim())}&mode=${mode}`;
      const res = await getJSON<{ dataMode: DataMode; results: SearchHit[] }>(path);
      setDataMode(res.dataMode);
      setResults(res.results);
      if (res.results.length === 0) setError("Nothing found — enter the details manually below.");
    } catch (e) {
      setResults([]);
      setError(e instanceof ApiError ? e.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function pick(hit: SearchHit) {
    setError("");
    setPicked(hit);
    setConfirm(false);
    setImporting(true);
    try {
      if (kind === "founder") {
        const res = await postJSON<{ mode: DataMode; prefill: Partial<FounderProfile>; facts: ImportedFact[] }>(
          "/api/profiles/import-founder",
          { id: hit.id, mode },
        );
        setPrefill(res.prefill);
        setFacts(res.facts);
        setDataMode(res.mode);
      } else {
        const res = await postJSON<{ mode: DataMode; prefill: Partial<CompanyProfile>; facts: ImportedFact[] }>(
          "/api/profiles/import-company",
          { id: hit.id, mode },
        );
        setPrefill(res.prefill);
        setFacts(res.facts);
        setDataMode(res.mode);
      }
    } catch (e) {
      setPrefill(null);
      setFacts([]);
      setError(e instanceof ApiError ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  function apply() {
    if (!prefill || !confirm) {
      setError(kind === "founder" ? "Confirm this is you before saving." : "Confirm this is your company before saving.");
      return;
    }
    if (kind === "founder") {
      onApplied({
        founder: { ...(prefill as Partial<FounderProfile>), confirmedIdentity: true },
        facts,
      });
    } else {
      onApplied({ company: prefill as Partial<CompanyProfile>, facts });
    }
  }

  const label = kind === "founder" ? "Find yourself in Cala" : "Find your company in Cala";
  const loadingHint = mode === "cala" ? "Reading Cala's graph… this can take ~30 s cold" : "Loading demo match…";

  return (
    <div className="space-y-3 rounded-xl border border-line/80 bg-black/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>{label}</Label>
        <div className="inline-flex rounded-lg border border-line bg-black/30 p-0.5" role="radiogroup" aria-label="Import source">
          {(["cala", "demo"] as DataMode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cx(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition",
                mode === m ? "bg-white text-black" : "text-muted hover:text-ink",
              )}
            >
              {m === "cala" ? "Live · Cala" : "Demo"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <input
          className={field}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void search();
            }
          }}
          placeholder={kind === "founder" ? "Full name" : "Company name"}
          aria-label={kind === "founder" ? "Search people" : "Search companies"}
        />
        <button type="button" className={btn.secondary} onClick={() => void search()} disabled={searching || importing}>
          {searching ? <SearchPulse /> : null}
          Search
        </button>
      </div>

      {(searching || importing) && (
        <GraphLoading
          size="inline"
          title={importing ? "Importing from Cala" : "Searching the graph"}
          detail={importing ? loadingHint : "Matching names on Cala…"}
          lines={
            importing
              ? ["Reading the entity", "Pulling funding rounds", "Collecting sourced facts", "Building your profile"]
              : ["Looking up the name", "Matching entities", "Preparing results"]
          }
        />
      )}

      {dataMode && searched && (
        <Chip tone="neutral" className="text-[10px]">
          Source · {dataMode}
        </Chip>
      )}

      {results.length > 0 && !prefill && (
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {results.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => void pick(hit)}
                disabled={importing}
                className={cx(
                  "w-full rounded-lg border px-3 py-2 text-left transition",
                  picked?.id === hit.id ? "border-accent bg-accent-soft" : "border-line hover:border-accent/40",
                )}
              >
                <span className="block text-sm font-medium text-ink">{hit.name}</span>
                {hit.description ? <span className="mt-0.5 line-clamp-2 text-[11px] text-muted">{hit.description}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      {prefill && (
        <div className="space-y-3 border-t border-line pt-3">
          <p className="text-sm text-ink">
            Selected: <span className="font-medium">{picked?.name}</span>
          </p>
          {facts.length > 0 && (
            <ul className="space-y-1.5 text-xs text-muted">
              {facts.map((f) => (
                <li key={f.label}>
                  <span className="text-ink-2">{f.label}:</span> {f.value}
                  {f.sources[0]?.url ? (
                    <>
                      {" "}
                      <a href={f.sources[0].url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                        source
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-1" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            <span>{kind === "founder" ? "I confirm this is me" : "I confirm this is my company"}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn.primary} onClick={apply} disabled={!confirm}>
              Use this import
            </button>
            <button
              type="button"
              className={btn.ghost}
              onClick={() => {
                setPrefill(null);
                setFacts([]);
                setPicked(null);
                setConfirm(false);
              }}
            >
              Pick another
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-bad">{error}</p>}

      {(searched && results.length === 0) || error.includes("Nothing found") ? (
        <button type="button" className={btn.ghost} onClick={onManual}>
          Enter manually instead →
        </button>
      ) : (
        <button type="button" className="text-[11px] text-muted hover:text-ink" onClick={onManual}>
          Skip import · enter manually
        </button>
      )}
    </div>
  );
}
