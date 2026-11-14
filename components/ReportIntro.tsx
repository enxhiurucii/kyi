"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtMonthsAgo, fmtPct } from "@/lib/format";
import type { GraphModel } from "@/lib/graph";
import type { InvestorReport, Tone } from "@/lib/types";
import GraphScene from "./GraphScene";
import { Chip, cx, ScoreRing } from "./ui";

type Scene = {
  id: string;
  kicker: string;
  title: string;
  sub?: string;
  tone?: Tone;
  graph?: "hero" | "dim";
  score?: number;
  chips?: { label: string; tone: Tone }[];
};

function buildScenes(r: InvestorReport, graph: GraphModel, hasStartup: boolean): Scene[] {
  const nRounds = graph.nodes.filter((n) => n.kind === "round").length;
  const nCos = graph.nodes.filter((n) => n.kind === "company").length;
  const status =
    r.activity.status === "active"
      ? "Still writing cheques."
      : r.activity.status === "slowing"
        ? "The pace is slowing."
        : r.activity.status === "inactive"
          ? "They have gone quiet."
          : "Activity is unclear.";
  const statusTone: Tone = r.activity.status === "active" ? "good" : r.activity.status === "slowing" ? "warn" : r.activity.status === "inactive" ? "bad" : "neutral";
  const conflict = r.conflicts[0];
  const scenes: Scene[] = [
    {
      id: "title",
      kicker: "Know Your Investor",
      title: r.investor.name,
      sub: [r.investor.kind, r.investor.country].filter(Boolean).join(" · ") || r.investor.description,
      graph: "hero",
    },
    {
      id: "walk",
      kicker: "Not their website",
      title: "Investor → round → company",
      sub: `${nRounds} rounds and ${nCos} companies in the graph Cala actually stores.`,
      graph: "hero",
    },
  ];
  if (hasStartup && r.fitScore) {
    scenes.push({
      id: "fit",
      kicker: "Fit for your round",
      title: `${r.fitScore.score}`,
      sub: "out of 100 — scored from the graph, not a pitch deck",
      score: r.fitScore.score,
      chips: r.fitScore.reasons.slice(0, 4),
      graph: "dim",
    });
  }
  scenes.push({
    id: "activity",
    kicker: "Are they still investing?",
    title: status,
    sub: `Last deal ${fmtMonthsAgo(r.activity.monthsSinceLastDeal)} · ${r.activity.dealsLast12m} deals in 12 months`,
    tone: statusTone,
    graph: "dim",
  });
  if (hasStartup) {
    if (conflict) {
      scenes.push({
        id: "conflict",
        kicker: "Watch this",
        title: `They already back ${conflict.companyName}`,
        sub: `${Math.round(conflict.similarity * 100)}% similar to what you are building.`,
        tone: conflict.similarity >= 0.45 ? "bad" : "warn",
        graph: "dim",
      });
    } else {
      scenes.push({
        id: "conflict",
        kicker: "Conflict check",
        title: "No obvious overlap",
        sub: "Nothing close in the recent portfolio.",
        tone: "good",
        graph: "dim",
      });
    }
  }
  scenes.push({
    id: "lead",
    kicker: "Do they lead?",
    title: fmtPct(r.leadership.leadRate),
    sub: r.leadership.knownRoles ? `Led ${r.leadership.leads} of ${r.leadership.knownRoles} rounds with a known role.` : "Lead role is not always recorded.",
    graph: "dim",
  });
  for (const [i, t] of r.talkingPoints.slice(0, 2).entries()) {
    scenes.push({
      id: `say-${i}`,
      kicker: "Say this in the room",
      title: t.text,
      tone: t.tone,
      graph: "dim",
    });
  }
  return scenes;
}

export default function ReportIntro({
  report,
  graph,
  hasStartup = true,
  onDone,
}: {
  report: InvestorReport;
  graph: GraphModel;
  hasStartup?: boolean;
  onDone: () => void;
}) {
  const scenes = useMemo(() => buildScenes(report, graph, hasStartup), [report, graph, hasStartup]);
  const [i, setI] = useState(0);
  const scene = scenes[i] ?? scenes[0];
  const last = i >= scenes.length - 1;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onDone();
      return;
    }
    const ms = scene?.id === "title" || scene?.id === "walk" ? 4200 : 3400;
    const t = window.setTimeout(() => {
      if (last) onDone();
      else setI((x) => x + 1);
    }, ms);
    return () => window.clearTimeout(t);
  }, [i, last, onDone, scene?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDone();
      }
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (last) onDone();
        else setI((x) => x + 1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setI((x) => Math.max(0, x - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last, onDone]);

  function advance() {
    if (last) onDone();
    else setI((x) => x + 1);
  }

  if (!scene) return null;

  return (
    <div className="cinema no-print" onClick={advance} role="presentation">
      <div className={cx("cinema-graph", scene.graph === "hero" ? "is-hero" : "is-dim")}>
        <GraphScene model={graph} walking chrome={false} className="h-full rounded-none" />
      </div>
      <div className="cinema-vignette" aria-hidden />

      <button
        type="button"
        className="cinema-skip"
        onClick={(e) => {
          e.stopPropagation();
          onDone();
        }}
      >
        Skip to the card →
      </button>

      <div className="cinema-copy">
        <div key={scene.id} className="cinema-scene">
          <p className="cinema-kicker">{scene.kicker}</p>
          {scene.score != null ? (
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-end sm:gap-10">
              <ScoreRing score={scene.score} size={168} label="Fit" />
              <div>
                <h1 className="cinema-title tabular">{scene.score}</h1>
                {scene.sub && <p className="cinema-sub">{scene.sub}</p>}
                {scene.chips && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {scene.chips.map((c) => (
                      <Chip key={c.label} tone={c.tone}>
                        {c.label}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <h1
                className={cx(
                  "cinema-title",
                  scene.id.startsWith("say") && "cinema-title-quote",
                  scene.tone === "good" && "text-good",
                  scene.tone === "warn" && "text-warn",
                  scene.tone === "bad" && "text-bad",
                )}
              >
                {scene.title}
              </h1>
              {scene.sub && <p className="cinema-sub">{scene.sub}</p>}
            </>
          )}
        </div>
      </div>

      <div className="cinema-nav">
        <span className="text-[11px] tracking-[0.14em] text-white/40 uppercase">{last ? "Click for the full card" : "Click or → to continue"}</span>
        <ol className="flex gap-1.5">
          {scenes.map((s, idx) => (
            <li key={s.id}>
              <button
                type="button"
                className={cx("h-1.5 rounded-full transition-all", idx === i ? "w-7 bg-white" : "w-1.5 bg-white/30 hover:bg-white/60")}
                aria-label={`Scene ${idx + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setI(idx);
                }}
              />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
