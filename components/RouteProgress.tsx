"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import GraphLoading from "./GraphLoading";

type Phase = "idle" | "running" | "finishing";

/**
 * Global navigation cue: a thin top progress bar as soon as an in-app link is clicked,
 * plus a soft graph-walk veil if the route takes longer than ~280 ms.
 * Hidden in present mode so the product demo video stays clean.
 */
export default function RouteProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const key = `${pathname}?${search.toString()}`;
  const [phase, setPhase] = useState<Phase>("idle");
  const [deep, setDeep] = useState(false);
  const deepTimer = useRef<number | null>(null);
  const doneTimer = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("idle");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const clearTimers = () => {
      if (deepTimer.current) window.clearTimeout(deepTimer.current);
      if (doneTimer.current) window.clearTimeout(doneTimer.current);
      deepTimer.current = null;
      doneTimer.current = null;
    };

    const start = () => {
      if (phaseRef.current === "running") return;
      clearTimers();
      phaseRef.current = "running";
      setPhase("running");
      setDeep(false);
      deepTimer.current = window.setTimeout(() => setDeep(true), 280);
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      const next = `${url.pathname}${url.search}`;
      const cur = `${window.location.pathname}${window.location.search}`;
      if (next === cur) return;
      start();
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimers();
    };
  }, []);

  // Complete when the route actually changes.
  useEffect(() => {
    if (phaseRef.current === "idle") return;
    if (deepTimer.current) window.clearTimeout(deepTimer.current);
    deepTimer.current = null;
    setDeep(false);
    phaseRef.current = "finishing";
    setPhase("finishing");
    doneTimer.current = window.setTimeout(() => {
      phaseRef.current = "idle";
      setPhase("idle");
    }, 240);
  }, [key]);

  // Safety timeout so a stuck navigation never leaves the veil up forever.
  useEffect(() => {
    if (phase !== "running") return;
    const safety = window.setTimeout(() => {
      setDeep(false);
      phaseRef.current = "finishing";
      setPhase("finishing");
      doneTimer.current = window.setTimeout(() => {
        phaseRef.current = "idle";
        setPhase("idle");
      }, 240);
    }, 12_000);
    return () => window.clearTimeout(safety);
  }, [phase]);

  if (phase === "idle") return null;

  return (
    <div className="present-hide pointer-events-none fixed inset-0 z-[60]" aria-busy={phase === "running"} aria-hidden={!deep}>
      <div className={`route-progress-bar ${phase === "running" ? "is-running" : "is-done"}`} />
      {deep ? (
        <div className="route-progress-veil absolute inset-0 flex items-center justify-center bg-bg/55 backdrop-blur-[3px]">
          <GraphLoading size="panel" eyebrow="Navigating" title="Opening the next view" detail="Keeping the graph warm…" />
        </div>
      ) : null}
    </div>
  );
}
