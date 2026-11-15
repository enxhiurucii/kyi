// Small presentational building blocks shared by all screens.
import type { ReactNode } from "react";
import type { DataMode, Distribution, InvestorReport, QuarterBucket, Tone } from "@/lib/types";

export function cx(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(" ");
}

const TONE: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  neutral: "bg-surface-2 text-ink-2",
};

export function Chip({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium", TONE[tone], className)}>{children}</span>;
}

export function Card({
  children,
  className,
  id,
  "data-testid": testId,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  "data-testid"?: string;
}) {
  return (
    <section id={id} data-testid={testId} className={cx("card-glass rounded-2xl", className)}>
      {children}
    </section>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("text-[11px] font-semibold uppercase tracking-[0.08em] text-muted", className)}>{children}</div>;
}

const STATUS: Record<InvestorReport["activity"]["status"], { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "good" },
  slowing: { label: "Slowing", tone: "warn" },
  inactive: { label: "Inactive", tone: "bad" },
  unknown: { label: "Unknown", tone: "neutral" },
};

export function StatusPill({ status }: { status: InvestorReport["activity"]["status"] }) {
  const s = STATUS[status];
  return (
    <Chip tone={s.tone}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {s.label}
    </Chip>
  );
}

export function scoreTone(score: number): Tone {
  return score >= 70 ? "good" : score >= 45 ? "warn" : "bad";
}

export function ScoreRing({
  score,
  size = 56,
  label,
  className,
}: {
  score: number;
  size?: number;
  label?: string;
  className?: string;
}) {
  const stroke = Math.max(4, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(score);
  const color = tone === "good" ? "var(--good)" : tone === "warn" ? "var(--warn)" : "var(--bad)";
  return (
    <div
      className={cx("relative shrink-0", className)}
      style={{ width: size, height: size, maxWidth: "100%" }}
      role="img"
      aria-label={`${label ?? "Fit score"} ${score} out of 100`}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90" width="100%" height="100%">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          className="score-ring-fg"
          style={{ color }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="tabular font-semibold" style={{ fontSize: `max(10px, ${size * 0.32}px)` }}>
          {score}
        </span>
      </div>
    </div>
  );
}

/** Full-height page wrapper for one-screen dashboards. */
export function FitPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "mx-auto w-full max-w-7xl px-3 pb-8 pt-4 sm:px-6",
        "fit:flex fit:h-[calc(100dvh-3.5rem)] fit:max-h-[calc(100dvh-3.5rem)] fit:flex-col fit:overflow-hidden fit:px-4 fit:pb-2 fit:pt-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** 12 quarterly bars: light = deals, dark = deals they led. */
export function Sparkline({ data, height = 44 }: { data: QuarterBucket[]; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.deals));
  const w = 100 / data.length;
  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
        {data.map((d, i) => {
          const h = (d.deals / max) * (height - 2);
          const hl = (d.leads / max) * (height - 2);
          return (
            <g key={d.quarter}>
              <rect x={i * w + w * 0.15} y={height - h} width={w * 0.7} height={h} rx={0.8} fill="var(--chart-2)" />
              <rect x={i * w + w * 0.15} y={height - hl} width={w * 0.7} height={hl} rx={0.8} fill="var(--chart-1)" />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{data[0]?.quarter.replace("-", " ")}</span>
        <span>{data[data.length - 1]?.quarter.replace("-", " ")}</span>
      </div>
    </div>
  );
}

export function Bars({ items, total }: { items: Distribution[]; total?: number }) {
  const sum = total ?? items.reduce((s, x) => s + x.count, 0);
  if (items.length === 0) return <p className="text-sm text-muted">No data.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((it) => {
        const pct = sum ? Math.round((it.count / sum) * 100) : 0;
        return (
          <li key={it.key} className="grid grid-cols-[minmax(0,7.5rem)_1fr_2.5rem] items-center gap-2 text-sm">
            <span className="truncate text-ink-2" title={it.label}>
              {it.label}
            </span>
            <span className="h-2 rounded-full bg-surface-2">
              <span className="block h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
            </span>
            <span className="tabular text-right text-xs text-muted">{pct}%</span>
          </li>
        );
      })}
    </ul>
  );
}

export function ModeBadge({ mode }: { mode: DataMode }) {
  return mode === "cala" ? (
    <Chip tone="good">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden /> Live
    </Chip>
  ) : (
    <Chip tone="warn">Demo</Chip>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("h-4 w-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-surface-2", className)} />;
}

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black shadow-[0_0_40px_-10px_rgba(154,155,255,0.9)] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white/5 px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-white/10 disabled:opacity-50",
  ghost: "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted transition hover:bg-white/5 hover:text-ink",
};

export const field =
  "w-full rounded-xl border border-line bg-black/35 px-3 py-2.5 text-sm text-ink placeholder:text-muted/60 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft";
