"use client";

import { useEffect, useState } from "react";
import { cx } from "./ui";

const NODES = [
  { label: "Investor", x: 48, y: 58 },
  { label: "Rounds", x: 160, y: 118 },
  { label: "Startups", x: 272, y: 58 },
  { label: "What next", x: 272, y: 168 },
] as const;

const EDGES = [
  "M88 70 H160 V118",
  "M200 118 H272 V70",
  "M310 94 V168",
] as const;

export type GraphLoadingProps = {
  /** Short eyebrow, e.g. Live / Demo / Searching */
  eyebrow?: string;
  /** Main line — rotates through `lines` when provided */
  title?: string;
  /** Supporting copy under the title */
  detail?: string;
  /** Rotating status lines (graph-walk story). Overrides `title` while cycling. */
  lines?: string[];
  /** Seconds elapsed (shows a tabular timer when > 0) */
  elapsed?: number;
  /** `page` = centered full section, `panel` = card-sized, `inline` = compact strip */
  size?: "page" | "panel" | "inline";
  className?: string;
};

/**
 * KYI graph-walk loader — nodes light up along Investor → Rounds → Startups → What next.
 * Used for route waits, Cala searches and long report builds so the app never feels blank.
 */
export default function GraphLoading({
  eyebrow = "KYI",
  title = "Walking the graph",
  detail,
  lines,
  elapsed = 0,
  size = "page",
  className,
}: GraphLoadingProps) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 900);
    return () => window.clearInterval(id);
  }, []);

  const active = tick % NODES.length;
  const line =
    lines && lines.length > 0
      ? lines[Math.min(lines.length - 1, Math.max(0, Math.floor(elapsed / 4) || tick % lines.length))]
      : title;

  const graph = (
    <svg
      viewBox="0 0 360 220"
      className={cx("graph-load-svg", size === "inline" ? "h-16 w-28" : size === "panel" ? "h-36 w-56" : "h-44 w-72")}
      aria-hidden
    >
      {EDGES.map((d, i) => (
        <path key={d} d={d} fill="none" strokeWidth="2" strokeLinecap="round" className={cx("graph-load-edge", active > i && "is-on")} />
      ))}
      {NODES.map((n, i) => (
        <g key={n.label} className={cx("graph-load-node", i <= active && "is-on", i === active && "is-current")}>
          <circle cx={n.x + 38} cy={n.y + 14} r="22" className="graph-load-ring" />
          <circle cx={n.x + 38} cy={n.y + 14} r="6" className="graph-load-dot" />
          <text x={n.x + 38} y={n.y + 44} textAnchor="middle" className="graph-load-label">
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );

  if (size === "inline") {
    return (
      <div
        className={cx("flex items-center gap-3 rounded-2xl border border-accent/25 bg-black/40 px-3 py-2.5 backdrop-blur-md", className)}
        role="status"
        aria-live="polite"
      >
        {graph}
        <div className="min-w-0 text-left">
          <p className="truncate text-sm font-medium text-ink">{line}</p>
          <p className="truncate text-xs text-muted">
            {detail}
            {elapsed > 0 ? <span className="tabular"> · {elapsed}s</span> : null}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center text-center",
        size === "page" ? "mx-auto max-w-3xl px-4 py-16 sm:px-6" : "rounded-3xl border border-line bg-black/45 p-8 backdrop-blur-md",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">{eyebrow}</p>
      <div className="graph-load-stage relative mt-5">{graph}</div>
      <h1 className={cx("mt-5 font-semibold tracking-tight text-ink", size === "page" ? "text-2xl" : "text-lg")}>{line}</h1>
      {detail ? (
        <p className="mt-2 max-w-md text-sm text-muted">
          {detail}
          {elapsed > 0 ? <span className="tabular"> · {elapsed}s</span> : null}
        </p>
      ) : elapsed > 0 ? (
        <p className="mt-2 text-sm tabular text-muted">{elapsed}s</p>
      ) : null}
      <div className="graph-load-bar mt-6 h-1 w-40 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <span />
      </div>
    </div>
  );
}

/** Tiny pulsing KYI mark for search fields while a request is in flight. */
export function SearchPulse({ className }: { className?: string }) {
  return (
    <span
      className={cx("search-pulse pointer-events-none inline-grid h-5 w-5 place-items-center rounded-md text-[8px] font-bold text-white", className)}
      aria-hidden
    >
      KYI
    </span>
  );
}
