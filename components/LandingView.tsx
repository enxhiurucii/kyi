"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { profileStore } from "@/lib/profileStore";
import { btn, Chip, cx, FitPage } from "./ui";

const FLOW = [
  { from: "Investor", to: "Funding rounds", detail: "leads + sources" },
  { from: "Funding rounds", to: "Startups", detail: "portfolio graph" },
  { from: "Startups", to: "What happened next", detail: "follow-on / raise-soon" },
];

export default function LandingView() {
  const router = useRouter();

  return (
    <FitPage className="fit:justify-center">
      <div className="grid min-h-0 min-w-0 gap-6 fit:h-full fit:grid-cols-[55fr_45fr] fit:items-stretch fit:gap-4">
        <section className="flex min-h-0 min-w-0 flex-col justify-center py-6 fit:py-2">
          <p className="hero-enter text-[11px] font-semibold tracking-[0.2em] text-muted uppercase">KYI</p>
          <h1
            className="hero-enter mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl fit:text-[clamp(1.75rem,2.6vw,2.75rem)]"
            style={{ animationDelay: "80ms" }}
          >
            Know Your Investor. Know Your Investment.
          </h1>
          <p className="hero-enter mt-3 max-w-xl text-sm leading-relaxed text-ink-2 fit:text-[14px]" style={{ animationDelay: "140ms" }}>
            Founders find lead investors. Investors see who raises next. Every number has a source — powered by Cala.
          </p>

          <div className="hero-enter mt-6 grid max-w-xl gap-3 sm:grid-cols-2" style={{ animationDelay: "200ms" }}>
            <Link
              href="/raise"
              data-testid="entry-raise"
              className="group rounded-2xl border border-line bg-black/30 p-4 transition hover:border-accent/40 hover:bg-black/45 fit:rounded-2xl"
            >
              <p className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">I&apos;m raising</p>
              <p className="mt-2 text-base font-semibold tracking-tight text-ink group-hover:text-accent">Find &amp; check investors →</p>
              <p className="mt-1 text-xs text-ink-2">Shortlist, fit scores, sourced reports.</p>
            </Link>
            <Link
              href="/invest"
              data-testid="entry-invest"
              className="group rounded-2xl border border-line bg-black/30 p-4 transition hover:border-accent/40 hover:bg-black/45"
            >
              <p className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">I&apos;m investing</p>
              <p className="mt-2 text-base font-semibold tracking-tight text-ink group-hover:text-accent">Find where to invest →</p>
              <p className="mt-1 text-xs text-ink-2">Market radar &amp; company cards.</p>
            </Link>
          </div>

          <div className="hero-enter mt-5 flex flex-wrap gap-2" style={{ animationDelay: "260ms" }}>
            <button
              type="button"
              className={btn.secondary}
              onClick={() => {
                profileStore.loadDemoProfile();
                router.push("/raise?mode=demo&demo=1");
              }}
            >
              Try as founder (Anna)
            </button>
            <button
              type="button"
              className={btn.secondary}
              onClick={() => {
                profileStore.loadDemoInvestorProfile();
                router.push(
                  "/market?mode=demo&demo=1&sectors=logistics,mobility&stages=pre-seed,seed&regions=Nordics,Baltics&tmin=500000&tmax=3000000",
                );
              }}
            >
              Try as investor (Mikko)
            </button>
          </div>
        </section>

        <aside className="min-h-0 min-w-0 rounded-2xl border border-line bg-black/30 p-4 fit:flex fit:flex-col fit:overflow-hidden">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">How it works</p>
          <h2 className="mt-1 text-base font-semibold tracking-tight">Graph walk — not a black box</h2>
          <svg viewBox="0 0 400 220" className="mt-3 w-full flex-1" aria-hidden>
            <defs>
              <linearGradient id="kyi-edge" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.8" />
              </linearGradient>
            </defs>
            {[
              { x: 40, y: 40, label: "Investor" },
              { x: 160, y: 100, label: "Funding rounds" },
              { x: 280, y: 40, label: "Startups" },
              { x: 280, y: 160, label: "What next" },
            ].map((n) => (
              <g key={n.label}>
                <rect x={n.x} y={n.y} width={100} height={36} rx={10} fill="var(--surface-2)" stroke="var(--line)" />
                <text x={n.x + 50} y={n.y + 22} textAnchor="middle" fill="var(--ink)" fontSize="11" fontWeight="600">
                  {n.label}
                </text>
              </g>
            ))}
            <path d="M140 58 H160 V118" fill="none" stroke="url(#kyi-edge)" strokeWidth="2" />
            <path d="M260 118 H280 V58" fill="none" stroke="url(#kyi-edge)" strokeWidth="2" />
            <path d="M330 76 V160" fill="none" stroke="url(#kyi-edge)" strokeWidth="2" />
          </svg>
          <ul className="mt-2 space-y-1.5 text-xs text-ink-2 fit:mt-auto">
            {FLOW.map((f) => (
              <li key={f.from} className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-ink">{f.from}</span>
                <span className="text-muted">→</span>
                <span>{f.to}</span>
                <Chip tone="neutral">{f.detail}</Chip>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {["Every number sourced", "Conflicts flagged", "Demo works offline"].map((b) => (
              <Chip key={b} tone="good">
                {b}
              </Chip>
            ))}
          </div>
        </aside>
      </div>

      {/* Mobile-only extras below — hidden on fit */}
      <section id="how" className="mt-10 fit:hidden">
        <div className="score-panel rounded-3xl border border-line p-5">
          <p className={cx("text-[11px] font-semibold tracking-[0.18em] text-muted uppercase")}>Explainable scores</p>
          <p className="mt-2 text-sm text-ink-2">
            Fit and raise-soon scores come from transparent rules on Cala&apos;s graph — activity, stage, sector, leads,
            follow-on, geography — minus conflicts.
          </p>
        </div>
      </section>
    </FitPage>
  );
}
