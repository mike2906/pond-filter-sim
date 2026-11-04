import type { Design, Id, SolveResult } from '@pond/engine';

/** A scalar read off a solve result, for sweeps and goal seek. SI units. */
export type Metric =
  | { kind: 'total-flow' }
  | { kind: 'node-level'; id: Id }
  | { kind: 'drawdown'; id: Id }
  | { kind: 'freeboard'; id: Id }
  | { kind: 'link-flow'; id: Id }
  | { kind: 'link-loss'; id: Id }
  | { kind: 'link-velocity'; id: Id };

/** Flow returned to the pond(s): the sum over links that end at a pond. */
export function totalFlow(design: Design, r: SolveResult): number {
  const ponds = new Set(design.nodes.filter((n) => n.kind === 'pond').map((n) => n.id));
  return design.links.filter((l) => ponds.has(l.to)).reduce((s, l) => s + Math.max(0, r.links[l.id]?.flowM3s ?? 0), 0);
}

export function pondLevel(design: Design): number {
  const p = design.nodes.find((n) => n.kind === 'pond');
  return p && p.kind === 'pond' ? p.levelM : 0;
}

export function readMetric(design: Design, r: SolveResult, m: Metric): number {
  if (r.status !== 'ok') return Number.NaN;
  switch (m.kind) {
    case 'total-flow':
      return totalFlow(design, r);
    case 'node-level':
      return r.nodes[m.id]?.levelM ?? Number.NaN;
    case 'drawdown':
      return pondLevel(design) - (r.nodes[m.id]?.levelM ?? Number.NaN);
    case 'freeboard':
      return -(r.nodes[m.id]?.freeboardM ?? Number.NaN);
    case 'link-flow':
      return r.links[m.id]?.flowM3s ?? Number.NaN;
    case 'link-loss':
      return r.links[m.id]?.headLossM ?? Number.NaN;
    case 'link-velocity':
      return r.links[m.id]?.velocityMs ?? Number.NaN;
  }
}

/**
 * The chamber that matters most for drawdown: the one feeding the pump or
 * airlift (the last chamber in a gravity train). Falls back to the lowest level.
 */
export function lastChamber(design: Design, r: SolveResult | undefined): Id | undefined {
  const driver = design.links.find((l) => (l.kind === 'pump' || l.kind === 'airlift') && !l.isolated);
  const fromNode = driver && design.nodes.find((n) => n.id === driver.from);
  if (fromNode && fromNode.kind === 'chamber') return fromNode.id;
  let best: { id: Id; level: number } | undefined;
  for (const n of design.nodes) {
    if (n.kind !== 'chamber') continue;
    const lv = r?.nodes[n.id]?.levelM;
    if (lv !== undefined && (!best || lv < best.level)) best = { id: n.id, level: lv };
  }
  return best?.id;
}
