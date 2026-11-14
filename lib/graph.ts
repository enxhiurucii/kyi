import type { CompanyBrief, InvestorReport } from "./types";

export type GraphKind = "investor" | "round" | "company";

export interface GraphNode {
  id: string;
  label: string;
  kind: GraphKind;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Showcase graph for the home hero — the same shape Cala actually stores. */
export function heroGraph(): GraphModel {
  const investor: GraphNode = { id: "inv", label: "Sisu Seed", kind: "investor" };
  const co: GraphNode[] = [
    { id: "co1", label: "Lumo Ventures", kind: "investor" },
    { id: "co2", label: "Kide Capital", kind: "investor" },
  ];
  const companies: GraphNode[] = [
    { id: "c1", label: "Northhaul", kind: "company" },
    { id: "c2", label: "Fleetline", kind: "company" },
    { id: "c3", label: "Icepath", kind: "company" },
    { id: "c4", label: "Voltara", kind: "company" },
    { id: "c5", label: "Aether", kind: "company" },
    { id: "c6", label: "Kaira", kind: "company" },
    { id: "c7", label: "Silt", kind: "company" },
    { id: "c8", label: "Nimble", kind: "company" },
  ];
  const stages = ["Seed", "Pre-seed", "Seed", "Series A", "Seed", "Seed", "Series A", "Pre-seed", "Seed", "Seed"];
  const rounds: GraphNode[] = stages.map((label, i) => ({ id: `r${i}`, label, kind: "round" }));

  const edges: GraphEdge[] = [];
  const links: [number, number, boolean?][] = [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 0],
    [4, 3],
    [5, 4],
    [6, 5, true],
    [7, 1],
    [8, 6],
    [9, 7],
  ];
  for (const [ri, ci, withCo] of links) {
    edges.push({ from: "inv", to: `r${ri}` });
    edges.push({ from: `r${ri}`, to: companies[ci].id });
    if (withCo) edges.push({ from: "co1", to: `r${ri}` });
    if (ri === 4 || ri === 6) edges.push({ from: "co2", to: `r${ri}` });
  }

  return { nodes: [investor, ...co, ...rounds, ...companies], edges };
}

/** Denser graph for the full-page ambient background. */
export function ambientGraph(): GraphModel {
  const base = heroGraph();
  const extraCompanies: GraphNode[] = [
    { id: "c9", label: "Nimbus", kind: "company" },
    { id: "c10", label: "Harbor", kind: "company" },
    { id: "c11", label: "Lumen", kind: "company" },
    { id: "c12", label: "Forge", kind: "company" },
    { id: "c13", label: "Drift", kind: "company" },
    { id: "c14", label: "Quarry", kind: "company" },
  ];
  const extraRounds: GraphNode[] = extraCompanies.map((_, i) => ({ id: `rx${i}`, label: i % 2 ? "Seed" : "Series A", kind: "round" }));
  const extraInvestor: GraphNode = { id: "co3", label: "Arctic Loop", kind: "investor" };
  const edges: GraphEdge[] = [
    ...base.edges,
    ...extraRounds.map((r, i) => ({ from: i % 3 === 0 ? "co1" : "inv", to: r.id })),
    ...extraRounds.map((r, i) => ({ from: r.id, to: extraCompanies[i].id })),
    { from: "co3", to: "r2" },
    { from: "co3", to: "rx1" },
    { from: "co3", to: "rx4" },
  ];
  return { nodes: [...base.nodes, extraInvestor, ...extraRounds, ...extraCompanies], edges };
}

/** Walk an investor report into the same node/edge shape the 3D scene draws. */
export function reportGraph(r: InvestorReport): GraphModel {
  const nodes: GraphNode[] = [{ id: r.investor.id, label: r.investor.name, kind: "investor" }];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>([r.investor.id]);

  const rounds = Object.values(r.rounds)
    .filter((x) => x.investors.some((p) => p.investorId === r.investor.id))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 14);

  for (const round of rounds) {
    if (!seen.has(round.id)) {
      nodes.push({ id: round.id, label: round.stageLabel || "Round", kind: "round" });
      seen.add(round.id);
    }
    edges.push({ from: r.investor.id, to: round.id });

    const cid = round.companyId || `co-${round.id}`;
    const cname = round.companyName || "Portfolio company";
    if (!seen.has(cid)) {
      nodes.push({ id: cid, label: cname, kind: "company" });
      seen.add(cid);
    }
    edges.push({ from: round.id, to: cid });
  }

  for (const co of r.coInvestors.slice(0, 3)) {
    const id = `coinv-${co.name}`;
    if (!seen.has(id)) {
      nodes.push({ id, label: co.name, kind: "investor" });
      seen.add(id);
    }
    for (const rid of co.roundIds.slice(0, 2)) {
      if (seen.has(rid)) edges.push({ from: id, to: rid });
    }
  }

  return { nodes, edges };
}

export function incomingGraph(b: CompanyBrief): GraphModel {
  const nodes: GraphNode[] = [{ id: b.company.id, label: b.company.name, kind: "company" }];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>([b.company.id]);
  const rounds = Object.values(b.rounds)
    .filter((r) => r.companyId === b.company.id || r.companyName === b.company.name)
    .sort((a, c) => (c.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 10);
  for (const round of rounds) {
    if (!seen.has(round.id)) {
      nodes.push({ id: round.id, label: round.stageLabel || "Round", kind: "round" });
      seen.add(round.id);
    }
    edges.push({ from: b.company.id, to: round.id });
    for (const p of round.investors.slice(0, 4)) {
      if (!seen.has(p.investorId)) {
        nodes.push({ id: p.investorId, label: p.investorName, kind: "investor" });
        seen.add(p.investorId);
      }
      edges.push({ from: p.investorId, to: round.id });
    }
  }
  return { nodes, edges };
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Concentric rings: investor at the core, rounds around it, companies further out. */
export function layoutGraph(model: GraphModel): Record<string, Vec3> {
  const pos: Record<string, Vec3> = {};
  const investors = model.nodes.filter((n) => n.kind === "investor");
  const rounds = model.nodes.filter((n) => n.kind === "round");
  const companies = model.nodes.filter((n) => n.kind === "company");

  const hub = model.nodes[0];
  if (hub) pos[hub.id] = { x: 0, y: 0, z: 0 };

  investors
    .filter((n) => !pos[n.id])
    .forEach((n, i, arr) => {
      const a = (i / Math.max(arr.length, 1)) * Math.PI * 2 + 0.4;
      pos[n.id] = { x: Math.cos(a) * 1.15, y: 0.55 + (i % 2) * 0.12, z: Math.sin(a) * 1.15 };
    });

  const roundAngle = new Map<string, number>();
  rounds.forEach((n, i) => {
    const a = (i / Math.max(rounds.length, 1)) * Math.PI * 2 - Math.PI / 2;
    roundAngle.set(n.id, a);
    pos[n.id] = {
      x: Math.cos(a) * 1.45,
      y: Math.sin(i * 1.7) * 0.22,
      z: Math.sin(a) * 1.45,
    };
  });

  const incoming = new Map<string, string[]>();
  for (const e of model.edges) {
    const list = incoming.get(e.to) ?? [];
    list.push(e.from);
    incoming.set(e.to, list);
  }

  companies.filter((n) => !pos[n.id]).forEach((n, i) => {
    const parents = incoming.get(n.id) ?? [];
    const angles = parents.map((id) => roundAngle.get(id)).filter((a): a is number => a != null);
    const a = angles.length ? angles.reduce((s, x) => s + x, 0) / angles.length : (i / Math.max(companies.length, 1)) * Math.PI * 2;
    const spread = ((i % 3) - 1) * 0.18;
    pos[n.id] = {
      x: Math.cos(a + spread) * 2.35,
      y: Math.cos(i * 1.3) * 0.38,
      z: Math.sin(a + spread) * 2.35,
    };
  });

  for (const n of model.nodes) {
    if (!pos[n.id]) pos[n.id] = { x: 0, y: 0, z: 0 };
  }
  return pos;
}
