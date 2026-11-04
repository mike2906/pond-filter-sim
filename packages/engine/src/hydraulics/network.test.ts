import { describe, expect, it } from 'vitest';
import { simpleGravityAirlift } from '../../fixtures/simple-gravity-airlift';
import { pipeFriction } from '../friction';
import type { ChamberNode, Design, Link, PipeLink, PondNode, PumpLink } from '../model';
import { solve } from '../solve';
import { flow } from '../units';
import { GRAVITY, waterKinematicViscosity } from '../water';

const pond = (id = 'pond', levelM = 0): PondNode => ({ id, kind: 'pond', name: id, levelM, surfaceAreaM2: 30, volumeM3: 40, floorM: -1.5 });
const chamber = (id: string, wallCrestM = 0.1): ChamberNode => ({ id, kind: 'chamber', name: id, shape: { type: 'rect', lengthM: 1, widthM: 1 }, floorM: -1, wallCrestM });
const pipe = (id: string, from: string, to: string, d = 0.1036, lengthM = 6, extra: Partial<PipeLink> = {}): PipeLink => ({
  id, kind: 'pipe', from, to, internalDiameterM: d, lengthM, roughnessM: 1.5e-6,
  fittings: [{ type: 'entrance-flush', count: 1 }, { type: 'exit', count: 1 }],
  inletElevationM: -1, outletElevationM: -1, ...extra,
});
const m3h = flow.fromM3PerHour;
const pump = (id: string, from: string, to: string, speedFraction = 1): PumpLink => ({
  id, kind: 'pump', from, to, speedFraction, intakeElevationM: -0.8,
  curve: [[0, 4], [10, 3.5], [20, 2.5], [30, 1], [35, 0]].map(([q, h]) => ({ flowM3s: m3h(q as number), headM: h as number })),
});
const design = (nodes: Design['nodes'], links: Link[], tempC = 15): Design => ({ schemaVersion: 1, name: 't', water: { tempC }, nodes, links });

const continuity = (d: Design, r: ReturnType<typeof solve>) => {
  for (const n of d.nodes.filter((n) => n.kind !== 'pond')) {
    let s = 0;
    for (const l of d.links) {
      const q = r.links[l.id]?.flowM3s ?? 0;
      if (l.from === n.id) s -= q;
      if (l.to === n.id) s += q;
    }
    expect(Math.abs(s)).toBeLessThan(1e-8);
  }
};

describe('network solver', () => {
  it('matches the pipe law between two ponds', () => {
    const d = design([pond('a', 0), pond('b', -0.1)], [pipe('p', 'a', 'b', 0.1036, 10, { fittings: [] })]);
    const r = solve(d);
    expect(r.status).toBe('ok');
    const q = r.links.p?.flowM3s ?? 0;
    const loss = pipeFriction({ diameterM: 0.1036, lengthM: 10, roughnessM: 1.5e-6, flowM3s: q, kinematicViscosity: waterKinematicViscosity(15) }).frictionLossM;
    // Within 1 µm: the solver adds a 1e-4 m per m³/s regularisation term.
    expect(loss).toBeCloseTo(0.1, 5);
  });

  it('solves a gravity-fed chamber with a pumped return', () => {
    const d = design(
      [pond(), chamber('c'), { id: 'j', kind: 'junction', name: 'Pump outlet', elevationM: -0.5 }],
      [pipe('drain', 'pond', 'c'), pump('pump', 'c', 'j'), pipe('ret', 'j', 'pond', 0.0536, 8, { outletElevationM: 0.05, fittings: [{ type: 'elbow-90-short', count: 3 }, { type: 'exit', count: 1 }] })],
    );
    const r = solve(d);
    expect(r.status).toBe('ok');
    continuity(d, r);
    const q = r.links.pump?.flowM3s ?? 0;
    expect(q).toBeGreaterThan(m3h(5));
    expect(r.links.drain?.flowM3s).toBeCloseTo(q, 9);
    // Chamber sits below the pond by the drain line's loss.
    expect(r.nodes.c?.levelM).toBeLessThan(0);
    expect(-(r.nodes.c?.levelM ?? 0)).toBeCloseTo(r.links.drain?.headLossM ?? 0, 10);
    // Pump head = lift from chamber to junction head.
    expect(r.links.pump?.pump?.headM).toBeCloseTo((r.nodes.j?.levelM ?? 0) - (r.nodes.c?.levelM ?? 0), 6);
    // Return pipe discharges above the pond, so the junction must reach the outlet elevation plus losses.
    expect(r.nodes.j?.levelM).toBeGreaterThan(0.05);
    // Budget: everything on the critical path, shares sum to 1, parts sum to each entry.
    expect(r.criticalPath).toEqual(['drain', 'pump', 'ret']);
    expect(r.budget.reduce((s, b) => s + b.share, 0)).toBeCloseTo(1, 10);
    for (const b of r.budget) expect(b.parts.reduce((s, p) => s + p.headLossM, 0)).toBeCloseTo(b.headLossM, 10);
    expect(r.budget[0]?.linkId).toBe('ret');
  });

  it('splits flow between unequal parallel drain lines at equal head loss', () => {
    const d = design(
      [pond(), chamber('c'), { id: 'j', kind: 'junction', name: 'j', elevationM: -0.5 }],
      [pipe('big', 'pond', 'c', 0.1036, 8), pipe('small', 'pond', 'c', 0.0536, 8), pump('pump', 'c', 'j'), pipe('ret', 'j', 'pond', 0.1036, 2)],
    );
    const r = solve(d);
    expect(r.status).toBe('ok');
    continuity(d, r);
    expect(r.links.big?.headLossM).toBeCloseTo(r.links.small?.headLossM ?? 0, 9);
    expect((r.links.big?.flowM3s ?? 0) / (r.links.small?.flowM3s ?? 1)).toBeGreaterThan(3);
  });

  it('carries all flow through the open train when one is isolated', () => {
    const base = [pond(), chamber('c'), { id: 'j', kind: 'junction' as const, name: 'j', elevationM: -0.5 }];
    const links: Link[] = [pipe('a', 'pond', 'c'), pipe('b', 'pond', 'c'), pump('pump', 'c', 'j'), pipe('ret', 'j', 'pond', 0.1036, 2)];
    const open = solve(design(base, links));
    const isolated = solve(design(base, links.map((l) => (l.id === 'b' ? { ...l, isolated: true } : l))));
    expect(isolated.status).toBe('ok');
    expect(isolated.links.b?.flowM3s).toBe(0);
    expect(isolated.links.a?.flowM3s ?? 0).toBeGreaterThan(open.links.a?.flowM3s ?? 0);
    // One line has to carry it all, so the chamber draws down further.
    expect(isolated.nodes.c?.levelM ?? 0).toBeLessThan(open.nodes.c?.levelM ?? 0);
  });

  it('returns pump-fed flow over a free weir that matches the weir law', () => {
    const d = design(
      [pond(), { ...chamber('top', 0.4), floorM: -0.2 }, { id: 'j', kind: 'junction', name: 'j', elevationM: -0.5 }],
      [pump('pump', 'pond', 'j'), pipe('up', 'j', 'top', 0.0536, 5, { outletElevationM: 0.35 }), { id: 'weir', kind: 'weir', from: 'top', to: 'pond', crestM: 0.2, widthM: 0.3 }],
    );
    const r = solve(d);
    expect(r.status).toBe('ok');
    continuity(d, r);
    const h = (r.nodes.top?.levelM ?? 0) - 0.2;
    expect(r.links.weir?.flowM3s).toBeCloseTo(0.62 * (2 / 3) * Math.sqrt(2 * GRAVITY) * 0.3 * h ** 1.5, 10);
    expect(r.links.weir?.regime).toBe('free');
  });

  it('warns when a chamber overflows', () => {
    const d = design(
      [pond(), { ...chamber('top', 0.25), floorM: -0.2 }, { id: 'j', kind: 'junction', name: 'j', elevationM: -0.5 }],
      [pump('pump', 'pond', 'j'), pipe('up', 'j', 'top', 0.0536, 5, { outletElevationM: 0.35 }), { id: 'weir', kind: 'weir', from: 'top', to: 'pond', crestM: 0.2, widthM: 0.05 }],
    );
    const r = solve(d);
    expect(r.warnings.some((w) => w.code === 'overflow' && w.targetId === 'top')).toBe(true);
  });

  it('reports no operating point when the pump cannot reach the head', () => {
    const d = design(
      [pond(), { ...chamber('top', 5), floorM: 4.4 }, { id: 'j', kind: 'junction', name: 'j', elevationM: -0.5 }],
      [pump('pump', 'pond', 'j'), pipe('up', 'j', 'top', 0.0536, 5, { outletElevationM: 4.5 }), { id: 'weir', kind: 'weir', from: 'top', to: 'pond', crestM: 4.6, widthM: 0.3 }],
    );
    const r = solve(d);
    expect(r.status).toBe('no-operating-point');
    expect(r.links.pump?.flowM3s).toBe(0);
  });

  it('slows the pump at reduced speed (affinity laws)', () => {
    const mk = (s: number) => design(
      [pond(), chamber('c'), { id: 'j', kind: 'junction', name: 'j', elevationM: -0.5 }],
      [pipe('drain', 'pond', 'c'), pump('pump', 'c', 'j', s), pipe('ret', 'j', 'pond', 0.1036, 2)],
    );
    expect(solve(mk(0.6)).links.pump?.flowM3s ?? 0).toBeLessThan(solve(mk(1)).links.pump?.flowM3s ?? 0);
  });

  it('flags components that arrive in later milestones, pointing at the link', () => {
    const r = solve(simpleGravityAirlift);
    expect(r.status).toBe('unsupported');
    expect(r.unsupported.length).toBeGreaterThan(0);
    expect(r.warnings.every((w) => w.code === 'not-implemented' && w.targetId !== undefined)).toBe(true);
    expect(r.warnings.map((w) => w.targetId)).toEqual(r.unsupported);
  });

  it('converges from a previous result in fewer iterations', () => {
    const d = design(
      [pond(), chamber('c'), { id: 'j', kind: 'junction', name: 'j', elevationM: -0.5 }],
      [pipe('drain', 'pond', 'c'), pump('pump', 'c', 'j'), pipe('ret', 'j', 'pond', 0.1036, 2)],
    );
    const first = solve(d);
    const again = solve(d, { initial: first });
    expect(again.iterations).toBeLessThanOrEqual(first.iterations);
    expect(again.links.pump?.flowM3s).toBeCloseTo(first.links.pump?.flowM3s ?? 0, 9);
  });
});
