import type { ReactNode } from "react";

export default function WorkspaceHeader({
  role,
  title,
  blurb,
  steps,
}: {
  role: string;
  title: string;
  blurb: string;
  steps: { n: string; label: string }[];
}) {
  return (
    <header className="border-b border-line/70 pb-8 pt-8 sm:pt-10">
      <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">{role}</p>
      <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-2 sm:text-base">{blurb}</p>
      <ol className="mt-6 flex flex-wrap gap-2" aria-label="What you will do">
        {steps.map((s) => (
          <li
            key={s.n}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-black/30 px-3 py-1.5 text-xs text-ink-2"
          >
            <span className="font-semibold text-accent">{s.n}</span>
            {s.label}
          </li>
        ))}
      </ol>
    </header>
  );
}

export function SectionTitle({
  step,
  title,
  hint,
  action,
}: {
  step?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {step && <p className="text-[11px] font-semibold tracking-[0.14em] text-accent uppercase">{step}</p>}
        <h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2>
        {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}
