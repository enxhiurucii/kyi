"use client";

import { useEffect, useRef } from "react";
import GraphScene from "./GraphScene";

/** Full-viewport 3D knowledge graph — visual only, no HUD. */
export default function GraphBackdrop() {
  const aura = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = aura.current;
    if (!el) return;
    let x = window.innerWidth * 0.62;
    let y = window.innerHeight * 0.4;
    let tx = x;
    let ty = y;
    let raf = 0;
    const move = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
    };
    const tick = () => {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", move, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
    };
  }, []);

  return (
    <>
      <GraphScene variant="ambient" />
      <div ref={aura} className="cursor-aura no-print" aria-hidden />
    </>
  );
}
