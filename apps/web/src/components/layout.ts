import type { Design, Node, PlanPlacement } from '@pond/engine';

/** Left-to-right order for the section: ponds first, then by plan x, then by flow order. */
export function nodeOrder(design: Design): Node[] {
  const idx = new Map(design.nodes.map((n, i) => [n.id, i]));
  const x = (n: Node) => design.layout?.[n.id]?.xM ?? (idx.get(n.id) ?? 0);
  return [...design.nodes].sort((a, b) => {
    if ((a.kind === 'pond') !== (b.kind === 'pond')) return a.kind === 'pond' ? -1 : 1;
    return x(a) - x(b) || (idx.get(a.id) ?? 0) - (idx.get(b.id) ?? 0);
  });
}

/** Plan footprint half-sizes in metres. */
export function footprint(n: Node): { hx: number; hy: number; round: boolean } {
  if (n.kind === 'pond') {
    const r = Math.sqrt(n.surfaceAreaM2 / Math.PI);
    return { hx: r, hy: r * 0.8, round: true };
  }
  if (n.kind === 'junction') return { hx: 0.15, hy: 0.15, round: false };
  if (n.shape.type === 'round') return { hx: n.shape.diameterM / 2, hy: n.shape.diameterM / 2, round: true };
  return { hx: n.shape.lengthM / 2, hy: n.shape.widthM / 2, round: false };
}

export function placement(design: Design, n: Node, i: number): PlanPlacement {
  return design.layout?.[n.id] ?? { xM: i * 1.2, yM: 0 };
}

/**
 * Fills in plan positions for nodes that have none: ponds on the left, then
 * columns by flow depth (longest path from a pond), each column spread in y.
 * Existing positions are kept.
 */
export function withAutoLayout(design: Design): Design {
  const missing = design.nodes.filter((n) => !design.layout?.[n.id]);
  if (missing.length === 0) return design;
  const depth = new Map<string, number>();
  for (const n of design.nodes) if (n.kind === 'pond') depth.set(n.id, 0);
  // Bellman-Ford style relaxation; edges into ponds are ignored so loops through the pond don't count.
  for (let pass = 0; pass < design.nodes.length; pass++) {
    let changed = false;
    for (const l of design.links) {
      const to = design.nodes.find((n) => n.id === l.to);
      if (!to || to.kind === 'pond') continue;
      const d = depth.get(l.from);
      if (d === undefined) continue;
      if ((depth.get(l.to) ?? -1) < d + 1) {
        depth.set(l.to, d + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const maxDepth = Math.max(0, ...depth.values());
  for (const n of design.nodes) if (!depth.has(n.id)) depth.set(n.id, maxDepth + 1);

  const columns = new Map<number, Node[]>();
  for (const n of design.nodes) {
    const d = depth.get(n.id)!;
    columns.set(d, [...(columns.get(d) ?? []), n]);
  }
  const layout: Record<string, PlanPlacement> = { ...(design.layout ?? {}) };
  let x = 0;
  for (const d of [...columns.keys()].sort((a, b) => a - b)) {
    const col = columns.get(d)!;
    const halfW = Math.max(...col.map((n) => footprint(n).hx));
    const heights = col.map((n) => footprint(n).hy * 2 + 0.4);
    const total = heights.reduce((s, h) => s + h, 0);
    let y = -total / 2;
    col.forEach((n, i) => {
      const h = heights[i]!;
      if (!layout[n.id]) layout[n.id] = { xM: Number((x + halfW).toFixed(2)), yM: Number((y + h / 2).toFixed(2)) };
      y += h;
    });
    x += halfW * 2 + 0.5;
  }
  return { ...design, layout };
}
