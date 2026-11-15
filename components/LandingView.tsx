"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { profileStore } from "@/lib/profileStore";
import { btn, Chip, cx, FitPage } from "./ui";

const WALK = [
  { title: "Investor", text: "Who they are, how active, how often they lead.", detail: "leads + sources" },
  { title: "Funding rounds", text: "Every round they joined — date, size, co-investors.", detail: "dated + sourced" },
  { title: "Startups", text: "Their portfolio, and any conflict with yours.", detail: "portfolio graph" },
  { title: "What happened next", text: "Follow-on rounds, and who is likely to raise soon.", detail: "follow-on / raise-soon" },
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
              data-testid="persona-anna"
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
              data-testid="persona-mikko"
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

        <aside className="relative z-10 min-h-0 min-w-0 rounded-2xl border border-line bg-black/45 p-5 backdrop-blur-[2px] fit:flex fit:flex-col fit:justify-center fit:overflow-hidden">
          <div className="self-start rounded-xl bg-black/55 px-3 py-2 backdrop-blur-md">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">How it works</p>
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-ink">Graph walk — not a black box</h2>
          </div>
          <ol className="mt-4">
            {WALK.map((s, i) => (
              <li key={s.title} className="relative flex gap-3 pb-3 last:pb-0">
                {i < WALK.length - 1 ? (
                  <span aria-hidden className="absolute top-9 bottom-0 left-[17px] w-px bg-accent/50" />
                ) : null}
                <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full border border-accent/60 bg-black/70 text-sm font-semibold text-accent backdrop-blur-md">
                  {i + 1}
                </span>
                <div className="min-w-0 rounded-xl border border-white/5 bg-black/55 px-3 py-2 backdrop-blur-md">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold text-ink">{s.title}</span>
                    <Chip tone="neutral">{s.detail}</Chip>
                  </div>
                  <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-wrap gap-1.5">
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
