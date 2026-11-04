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
