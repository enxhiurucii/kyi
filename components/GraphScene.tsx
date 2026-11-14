"use client";

import { useEffect, useMemo, useRef } from "react";
import { ambientGraph, heroGraph, layoutGraph, type GraphModel, type GraphNode, type Vec3 } from "@/lib/graph";
import { cx } from "./ui";

const KIND_COLOR: Record<GraphNode["kind"], string> = {
  investor: "#8b8cff",
  round: "#f0c674",
  company: "#5ee0b0",
};

const KIND_SIZE: Record<GraphNode["kind"], number> = {
  investor: 7.5,
  round: 3.6,
  company: 5.2,
};

type Props = {
  model?: GraphModel;
  walking?: boolean;
  variant?: "panel" | "ambient";
  className?: string;
  caption?: string;
  chrome?: boolean;
};

export default function GraphScene({ model, walking = false, variant = "panel", className, caption, chrome = true }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ambient = variant === "ambient";
  const data = useMemo(() => model ?? (ambient ? ambientGraph() : heroGraph()), [model, ambient]);
  const dataRef = useRef(data);
  const graphKey = `${variant}:${data.nodes.map((n) => n.id).join("|")}:${data.edges.length}:${walking}`;

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    const wrapEl = wrapRef.current;
    if (!canvasEl || !wrapEl) return;
    const ctx2d = canvasEl.getContext("2d", { alpha: ambient });
    if (!ctx2d) return;
    // Locals so nested handlers keep non-null types under strict TS.
    const canvas: HTMLCanvasElement = canvasEl;
    const wrap: HTMLDivElement = wrapEl;
    const ctx: CanvasRenderingContext2D = ctx2d;

    const graph = dataRef.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const positions = layoutGraph(graph);
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    const outgoing = new Map<string, string[]>();
    for (const e of graph.edges) {
      const list = outgoing.get(e.from) ?? [];
      list.push(e.to);
      outgoing.set(e.from, list);
    }
    const walks = buildWalks(graph, outgoing);

    const stars = Array.from({ length: ambient ? 180 : 70 }, () => ({
      x: (Math.random() - 0.5) * (ambient ? 16 : 8),
      y: (Math.random() - 0.5) * (ambient ? 10 : 5),
      z: (Math.random() - 0.5) * (ambient ? 16 : 8),
      s: 0.8 + Math.random() * 1.4,
    }));
    const nebulae = ambient
      ? [
          { x: 1.2, y: -0.4, z: -0.8, c: "#6d6dff", r: 220 },
          { x: -0.6, y: 0.8, z: 1.1, c: "#5ee0b0", r: 180 },
          { x: 0.4, y: 0.2, z: 1.6, c: "#f0c674", r: 140 },
        ]
      : [];
    const particles = graph.edges.flatMap((e, i) => {
      const n = ambient ? 2 : walking ? 2 : 1;
      return Array.from({ length: n }, (_, k) => ({
        e,
        t: (i * 0.17 + k * 0.41) % 1,
        speed: (ambient ? 0.032 : 0.08) + (i % 5) * 0.01,
      }));
    });

    let yaw = ambient && !reduce ? 1.05 : 0.55;
    let pitch = 0.34;
    let targetYaw = 0.55;
    let targetPitch = 0.28;
    let dist = ambient && !reduce ? 7.2 : ambient ? 4.6 : 5.4;
    const restDist = ambient ? 4.55 : 5.4;
    let intro = reduce || !ambient ? 1 : 0;
    let hover: string | null = null;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let parallaxX = 0;
    let parallaxY = 0;
    let mouseX = 0;
    let mouseY = 0;
    let walkIndex = 0;
    let walkT = 0;
    let raf = 0;
    let last = performance.now();
    let running = true;

    const colorOf = (id: string) => KIND_COLOR[nodeById.get(id)?.kind ?? "round"];

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = wrap.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function rot(p: Vec3): Vec3 {
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      const cx = Math.cos(pitch);
      const sx = Math.sin(pitch);
      const xz = p.x * cy - p.z * sy;
      const zz = p.x * sy + p.z * cy;
      return { x: xz, y: p.y * cx - zz * sx, z: p.y * sx + zz * cx };
    }

    function project(p: Vec3, w: number, h: number) {
      const r = rot(p);
      const z = r.z + dist;
      const f = (Math.min(w, h) * (ambient ? 1.18 : 0.92)) / Math.max(z, 0.4);
      const ox = ambient ? w * 0.62 : w / 2;
      const oy = ambient ? h * 0.42 : h / 2;
      return { x: ox + r.x * f, y: oy + r.y * f, z, f, r };
    }

    function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
    }

    function frame(now: number) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (intro < 1) {
        intro = Math.min(1, intro + dt / 1.4);
        const e = 1 - Math.pow(1 - intro, 3);
        dist = 7.2 + (restDist - 7.2) * e;
        targetYaw = 1.05 + (0.55 - 1.05) * e;
      }
      if (!dragging && !reduce) {
        targetYaw += (ambient ? 0.048 : walking ? 0.35 : 0.18) * dt;
        if (ambient) targetPitch = 0.26 + Math.sin(now / 9000) * 0.08 + parallaxY;
        targetYaw += parallaxX * 0.02;
      }
      yaw += (targetYaw - yaw) * (dragging ? 1 : ambient ? 0.045 : 0.12);
      pitch += (targetPitch - pitch) * (dragging ? 1 : ambient ? 0.045 : 0.12);

      if (ambient && !reduce && walks.length) {
        walkT += dt / 3.8;
        if (walkT >= 1) {
          walkT = 0;
          walkIndex = (walkIndex + 1) % walks.length;
        }
      }

      const { width, height } = wrap.getBoundingClientRect();
      if (ambient) {
        ctx.clearRect(0, 0, width, height);
      } else {
        const g = ctx.createRadialGradient(width * 0.5, height * 0.42, 20, width * 0.5, height * 0.5, Math.max(width, height) * 0.72);
        g.addColorStop(0, "#151836");
        g.addColorStop(0.45, "#0a0c18");
        g.addColorStop(1, "#05060b");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }

      ctx.globalCompositeOperation = "lighter";
      for (const neb of nebulae) {
        const p = project(neb, width, height);
        const rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, neb.r);
        rg.addColorStop(0, withAlpha(neb.c, 0.14));
        rg.addColorStop(1, withAlpha(neb.c, 0));
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, neb.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      ctx.fillStyle = ambient ? "rgba(180,190,255,0.75)" : "rgba(180,190,255,0.55)";
      for (const s of stars) {
        const p = project(s, width, height);
        if (p.z < 0.8) continue;
        const twinkle = 0.65 + Math.sin(now / 700 + s.x * 4) * 0.35;
        ctx.globalAlpha = Math.max(0.08, ((ambient ? 1.15 : 1.6) / p.z) * twinkle);
        ctx.fillRect(p.x, p.y, s.s, s.s);
      }
      ctx.globalAlpha = 1;

      const projected = new Map<string, ReturnType<typeof project>>();
      for (const n of graph.nodes) projected.set(n.id, project(positions[n.id], width, height));

      const path = walks[walkIndex] ?? [];
      const pathSet = new Set(path);

      const edges = [...graph.edges].sort((a, b) => {
        const za = ((projected.get(a.from)?.z ?? 0) + (projected.get(a.to)?.z ?? 0)) / 2;
        const zb = ((projected.get(b.from)?.z ?? 0) + (projected.get(b.to)?.z ?? 0)) / 2;
        return zb - za;
      });

      for (const e of edges) {
        const a = projected.get(e.from);
        const b = projected.get(e.to);
        if (!a || !b) continue;
        const onPath = pathSet.has(e.from) && pathSet.has(e.to);
        const depth = 1 / (((a.z + b.z) / 2) * 0.22);
        const alpha = Math.min(ambient ? 0.38 : 0.55, (ambient ? 0.07 : 0.12) + depth);
        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        grad.addColorStop(0, withAlpha(colorOf(e.from), onPath ? alpha + 0.25 : alpha));
        grad.addColorStop(1, withAlpha(colorOf(e.to), onPath ? alpha + 0.2 : alpha * 0.85));
        ctx.strokeStyle = grad;
        ctx.lineWidth = onPath ? 2.2 : hover && (hover === e.from || hover === e.to) ? 1.8 : ambient ? 1.1 : 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      if (ambient && path.length >= 2 && !reduce) {
        drawWalk(ctx, path, positions, project, width, height, walkT, colorOf);
      }

      if (!reduce) {
        ctx.globalCompositeOperation = "lighter";
        for (const p of particles) {
          p.t += p.speed * dt * (walking && !ambient ? 2.4 : 1);
          if (p.t > 1) p.t -= 1;
          const a = positions[p.e.from];
          const b = positions[p.e.to];
          if (!a || !b) continue;
          const q = project(lerp(a, b, p.t), width, height);
          ctx.fillStyle = withAlpha(colorOf(p.e.to), ambient ? 0.5 : walking ? 0.95 : 0.7);
          ctx.beginPath();
          ctx.arc(q.x, q.y, ambient ? 1.7 : walking ? 2.4 : 1.7, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = "source-over";
      }

      const core = projected.get(graph.nodes[0]?.id ?? "");
      if (core && ambient && !reduce) {
        const pulseT = (now / 2600) % 1;
        ctx.strokeStyle = withAlpha("#8b8cff", 0.28 * (1 - pulseT));
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(core.x, core.y, 18 + pulseT * 140, 0, Math.PI * 2);
        ctx.stroke();
      }

      const order = [...graph.nodes].sort((a, b) => (projected.get(b.id)?.z ?? 0) - (projected.get(a.id)?.z ?? 0));
      for (const n of order) {
        const p = projected.get(n.id);
        if (!p) continue;
        const md = Math.hypot(p.x - mouseX, p.y - mouseY);
        const near = ambient ? Math.max(0, 1 - md / 150) : 0;
        const onPath = pathSet.has(n.id);
        const base = KIND_SIZE[n.kind] * (n.kind === "investor" && n.id === graph.nodes[0]?.id ? 1.35 : 1) * (ambient ? 1.15 : 1);
        const radius = Math.max(2.2, base * (p.f / 95));
        const lit = hover === n.id || near > 0.62;
        const pulse = n.kind === "investor" && !reduce ? 1 + Math.sin(now / (ambient ? 1600 : 420)) * (ambient ? 0.12 : 0.08) : 1;
        const glow = (lit ? 0.48 : ambient ? 0.14 : 0.22) + near * 0.35 + (onPath ? 0.22 : 0);

        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = withAlpha(KIND_COLOR[n.kind], glow);
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * (ambient ? 4.8 : 3.1) * pulse * (1 + near * 0.4), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = withAlpha(KIND_COLOR[n.kind], ambient ? 0.78 : 0.9);
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#f7f8ff";
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.1, radius * 0.35), 0, Math.PI * 2);
        ctx.fill();

        const showLabel =
          (!ambient && (lit || (n.kind === "investor" && n.id === graph.nodes[0]?.id))) ||
          (ambient && (near > 0.55 || onPath));
        if (showLabel) {
          ctx.font = `${n.kind === "investor" ? 12 : 10}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.globalAlpha = ambient ? Math.max(near, onPath ? 0.85 : 0) : 1;
          ctx.fillStyle = "rgba(8,10,18,0.72)";
          const tw = ctx.measureText(n.label).width;
          ctx.fillRect(p.x - tw / 2 - 5, p.y + radius + 6, tw + 10, 16);
          ctx.fillStyle = lit ? "#ffffff" : "rgba(235,238,255,0.92)";
          ctx.fillText(n.label, p.x, p.y + radius + 18);
          ctx.globalAlpha = 1;
        }
      }

      raf = requestAnimationFrame(frame);
    }

    function hit(x: number, y: number) {
      const { width, height } = wrap.getBoundingClientRect();
      let best: { id: string; d: number } | null = null;
      for (const n of graph.nodes) {
        const p = project(positions[n.id], width, height);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < 18 && (!best || d < best.d)) best = { id: n.id, d };
      }
      return best?.id ?? null;
    }

    function onPointerDown(e: PointerEvent) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    }
    function onPointerMove(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      hover = hit(e.clientX - rect.left, e.clientY - rect.top);
      canvas.style.cursor = dragging ? "grabbing" : hover ? "pointer" : "grab";
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      targetYaw += dx * 0.008;
      targetPitch = clamp(targetPitch + dy * 0.006, -0.85, 1.05);
    }
    function onPointerUp() {
      dragging = false;
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      dist = clamp(dist + e.deltaY * 0.0024, 3.6, 8.2);
    }
    function onWindowMove(e: PointerEvent) {
      parallaxX = (e.clientX / window.innerWidth - 0.5) * 0.45;
      parallaxY = (e.clientY / window.innerHeight - 0.5) * 0.22;
      mouseX = e.clientX;
      mouseY = e.clientY;
    }

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    raf = requestAnimationFrame(frame);
    if (ambient) {
      window.addEventListener("pointermove", onWindowMove, { passive: true });
    } else {
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
      canvas.addEventListener("wheel", onWheel, { passive: false });
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onWindowMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [graphKey, ambient]);

  return (
    <div
      ref={wrapRef}
      className={cx(
        ambient ? "graph-backdrop no-print" : "graph-viewport no-print relative isolate overflow-hidden rounded-3xl",
        className,
      )}
      role="img"
      aria-hidden={ambient || undefined}
      aria-label={ambient ? undefined : (caption ?? "3D view of a knowledge graph: investor, funding rounds and portfolio companies")}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
      {!ambient && chrome && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 text-[10px] font-medium tracking-[0.14em] text-white/55 uppercase">
            <span>{walking ? "Walking the graph" : "Cala knowledge graph"}</span>
            <span className="hidden sm:inline">Drag to orbit · scroll to zoom</span>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap gap-3 p-4 text-[11px] text-white/70">
            <Legend swatch="#8b8cff" label="Investor" />
            <Legend swatch="#f0c674" label="Funding round" />
            <Legend swatch="#5ee0b0" label="Company" />
          </div>
        </>
      )}
    </div>
  );
}

function buildWalks(graph: GraphModel, outgoing: Map<string, string[]>): string[][] {
  const walks: string[][] = [];
  for (const n of graph.nodes.filter((x) => x.kind === "investor")) {
    for (const roundId of outgoing.get(n.id) ?? []) {
      const companies = outgoing.get(roundId) ?? [];
      if (companies[0]) walks.push([n.id, roundId, companies[0]]);
    }
  }
  return walks.length ? walks : [];
}

function drawWalk(
  ctx: CanvasRenderingContext2D,
  path: string[],
  positions: Record<string, Vec3>,
  project: (p: Vec3, w: number, h: number) => { x: number; y: number },
  w: number,
  h: number,
  t: number,
  colorOf: (id: string) => string,
) {
  const pts = path.map((id) => positions[id]).filter((p): p is Vec3 => !!p);
  if (pts.length < 2) return;
  const segs = pts.length - 1;
  const total = Math.max(0, Math.min(0.999, t)) * segs;
  const i = Math.min(segs - 1, Math.floor(total));
  const lt = total - i;
  const from = pts[i];
  const to = pts[i + 1];
  if (!from || !to) return;
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = withAlpha("#ffffff", 0.35);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  const a0 = project(pts[0], w, h);
  ctx.moveTo(a0.x, a0.y);
  for (let k = 1; k <= i; k++) {
    const q = project(pts[k], w, h);
    ctx.lineTo(q.x, q.y);
  }
  const mid = {
    x: from.x + (to.x - from.x) * lt,
    y: from.y + (to.y - from.y) * lt,
    z: from.z + (to.z - from.z) * lt,
  };
  const head = project(mid, w, h);
  ctx.lineTo(head.x, head.y);
  ctx.stroke();
  ctx.fillStyle = withAlpha(colorOf(path[Math.min(path.length - 1, i + 1)]), 0.95);
  ctx.beginPath();
  ctx.arc(head.x, head.y, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(head.x, head.y, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className="h-1.5 w-1.5 rounded-full" style={{ background: swatch, boxShadow: `0 0 8px ${swatch}` }} />
      {label}
    </span>
  );
}

function withAlpha(hex: string, a: number) {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
