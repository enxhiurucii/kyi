"use client";

// Slide-over that shows the funding rounds behind any number, with their sources.
import { useEffect, useState } from "react";
import { postJSON } from "@/lib/client";
import { fmtMonthYear } from "@/lib/format";
import type { DataMode, Round, SourceRef } from "@/lib/types";
import { Chip, cx, Spinner } from "./ui";

export interface EvidenceGroup {
  title: string;
  tone?: "good" | "bad" | "neutral";
  badge?: string;
  rounds: Round[];
}

export interface Evidence {
  title: string;
  subtitle?: string;
  groups: EvidenceGroup[];
}

export default function EvidenceDrawer({
  evidence,
  mode,
  investorId,
  onClose,
}: {
  evidence: Evidence | null;
  mode: DataMode;
  investorId: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!evidence) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [evidence, onClose]);

  if (!evidence) return null;
  const total = evidence.groups.reduce((s, g) => s + g.rounds.length, 0);

  return (
    <div className="no-print fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={evidence.title}>
      <button className="absolute inset-0 bg-black/55 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <div data-testid="evidence-drawer" className="animate-drawer relative flex h-full w-full max-w-xl flex-col border-l border-line bg-[#0b0d13] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line bg-surface px-5 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted">Evidence · {total} round{total === 1 ? "" : "s"}</div>
            <h3 className="mt-1 text-lg font-semibold tracking-tight">{evidence.title}</h3>
            {evidence.subtitle && <p className="mt-0.5 text-sm text-muted">{evidence.subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close evidence">
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {evidence.groups.map((g, gi) => (
            <div key={gi}>
              {(g.title || g.badge) && (
                <div className="mb-2 flex items-center gap-2">
                  {g.badge && <Chip tone={g.tone ?? "neutral"}>{g.badge}</Chip>}
                  <span className="text-sm font-semibold">{g.title}</span>
                </div>
              )}
              <ul className="space-y-2">
                {g.rounds.map((r) => (
                  <RoundCard key={r.id} round={r} mode={mode} investorId={investorId} />
                ))}
              </ul>
            </div>
          ))}
          {total === 0 && <p className="text-sm text-muted">No rounds to show.</p>}
        </div>
      </div>
    </div>
  );
}

function RoundCard({ round, mode, investorId }: { round: Round; mode: DataMode; investorId: string }) {
  const [fetched, setFetched] = useState<{ answer?: string; sources: SourceRef[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sources = fetched?.sources ?? round.sources;
  const others = round.investors.filter((p) => p.investorId !== investorId);
  const me = round.investors.find((p) => p.investorId === investorId);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      setFetched(await postJSON<{ answer?: string; sources: SourceRef[] }>("/api/sources", { round, mode }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className="rounded-xl border border-line bg-surface p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{round.companyName || <span className="text-muted">Company not loaded</span>}</div>
          <div className="text-xs text-muted">
            {round.stageLabel} · {fmtMonthYear(round.date)}
            {round.amountLabel ? ` · ${round.amountLabel}` : ""}
          </div>
        </div>
        {me && (
          <Chip tone={me.isLead ? "good" : "neutral"} className="shrink-0">
            {me.isLead ? "★ Led" : me.isLead === false ? "Participated" : "Role unknown"}
          </Chip>
        )}
      </div>
      {others.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {others.slice(0, 10).map((p) => (
            <span key={p.investorId + p.investorName} className={cx("rounded-md px-1.5 py-0.5 text-[11px]", p.isLead ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-2")}>
              {p.isLead ? "★ " : ""}
              {p.investorName}
            </span>
          ))}
          {others.length > 10 && <span className="text-[11px] text-muted">+{others.length - 10} more</span>}
        </div>
      )}
      <div className="mt-2.5 border-t border-line pt-2">
        {fetched?.answer && <p className="mb-2 text-xs text-ink-2">{fetched.answer}</p>}
        {sources.length > 0 ? (
          <ul className="space-y-0.5">
            {sources.slice(0, 4).map((s, i) => (
              <li key={i} className="truncate text-xs">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    ↗ {s.name}
                  </a>
                ) : (
                  <span className="text-muted">{s.name}</span>
                )}
                {s.date && <span className="text-muted"> · {s.date}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline disabled:opacity-60">
            {loading && <Spinner className="h-3 w-3" />} Show sources
          </button>
        )}
        {err && <p className="mt-1 text-xs text-bad">{err}</p>}
      </div>
    </li>
  );
}
