import { describe, expect, it } from 'vitest';
import type { ChamberNode, Design, Link, PipeLink, PondNode, PumpLink, StageLink, ValveLink } from '../model';
import { solve } from '../solve';
import { flow } from '../units';
import { GRAVITY } from '../water';

const m3h = flow.fromM3PerHour;
const pond = (id = 'pond', levelM = 0): PondNode => ({ id, kind: 'pond', name: id, levelM, surfaceAreaM2: 30, volumeM3: 40, floorM: -1.5 });
const chamber = (id: string, floorM = -1.2, wallCrestM = 0.1): ChamberNode => ({ id, kind: 'chamber', name: id, shape: { type: 'rect', lengthM: 1, widthM: 1 }, floorM, wallCrestM });
const pipe = (id: string, from: string, to: string, d: number, lengthM: number, extra: Partial<PipeLink> = {}): PipeLink => ({
  id, kind: 'pipe', from, to, internalDiameterM: d, lengthM, roughnessM: 1.5e-6,
  fittings: [{ type: 'entrance-flush', count: 1 }, { type: 'exit', count: 1 }],
  inletElevationM: -1, outletElevationM: -1, ...extra,
});
const pump = (id: string, from: string, to: string, curve: [number, number][], intakeElevationM = -0.8): PumpLink => ({
  id, kind: 'pump', from, to, speedFraction: 1, intakeElevationM,
  curve: curve.map(([q, h]) => ({ flowM3s: m3h(q), headM: h })),
});
const stage = (id: string, from: string, to: string, extra: Partial<StageLink> = {}): StageLink => ({
  id, kind: 'stage', from, to, direction: 'down', stage: { type: 'generic' }, ...extra,
});
const valve = (id: string, from: string, to: string, extra: Partial<ValveLink> = {}): ValveLink => ({
  id, kind: 'valve', from, to, valveType: 'ball', internalDiameterM: 0.1, openFraction: 1, ...extra,
});
const design = (nodes: Design['nodes'], links: Link[]): Design => ({ schemaVersion: 1, name: 't', water: { tempC: 15 }, nodes, links });

describe('solver robustness', () => {
  it('handles a pump curve with a flat tail (the curve is forced to fall beyond its last point)', () => {
    const d = design(
      [pond(), chamber('c'), { id: 'j', kind: 'junction', name: 'j', elevationM: 0.2 }],
      [pipe('drain', 'pond', 'c', 0.1, 4), pump('p', 'c', 'j', [[0, 2], [5, 2], [10, 2]]), pipe('ret', 'j', 'pond', 0.1, 2, { inletElevationM: 0.2, outletElevationM: -0.2 })],
    );
    const r = solve(d);
    expect(r.status).toBe('ok');
    expect(r.links.p?.flowM3s).toBeGreaterThan(0);
    expect(Number.isFinite(r.links.p?.flowM3s)).toBe(true);
  });

  it('solves a stage with no loss at all instead of throwing', () => {
    const d = design([pond('a', 0), chamber('c'), pond('b', -0.05)], [pipe('in', 'a', 'c', 0.1, 2), stage('s', 'c', 'b')]);
    const r = solve(d);
    expect(r.status).toBe('ok');
    expect(r.links.s?.flowM3s).toBeGreaterThan(0);
  });

  it('passes no flow through a closed valve', () => {
    const d = design([pond('a', 0), pond('b', -0.5)], [valve('v', 'a', 'b', { openFraction: 0 })]);
    const r = solve(d);
    expect(r.links.v?.flowM3s).toBe(0);
  });

  it('marks butterfly and slide valves unvalidated', () => {
    for (const valveType of ['butterfly', 'slide'] as const) {
      const r = solve(design([pond('a', 0), pond('b', -0.05)], [valve('v', 'a', 'b', { valveType })]));
      expect(r.links.v?.confidence).toBe('unvalidated');
      expect(r.links.v?.basis).toMatch(/stand in/);
    }
  });

  it('counts links that carry flow against their drawn direction in the budget', () => {
    // The return pipe is drawn pond → junction, but flow runs junction → pond.
    const d = design(
      [pond(), chamber('c'), { id: 'j', kind: 'junction', name: 'j', elevationM: -0.5 }],
      [pipe('drain', 'pond', 'c', 0.1, 4), pump('p', 'c', 'j', [[0, 4], [20, 2.5], [35, 0]]), pipe('ret', 'pond', 'j', 0.1, 6)],
    );
    const r = solve(d);
    expect(r.status).toBe('ok');
    expect(r.links.ret?.flowM3s).toBeLessThan(0);
    const ret = r.budget.find((b) => b.linkId === 'ret');
    expect(ret?.headLossM).toBeGreaterThan(0);
    expect(r.budget.every((b) => b.headLossM > 0)).toBe(true);
  });

  it('reports the drop from a pipe outlet above the water as its own part, not friction', () => {
    // Free discharge 0.2 m above the receiving pond.
    const d = design([pond('a', 0), pond('b', -0.5)], [pipe('p', 'a', 'b', 0.1, 5, { outletElevationM: -0.3 })]);
    const r = solve(d);
    const entry = r.budget.find((b) => b.linkId === 'p');
    const drop = entry?.parts.find((p) => p.kind === 'outlet');
    expect(drop?.headLossM).toBeCloseTo(0.2, 4);
    const sum = entry?.parts.reduce((s, p) => s + p.headLossM, 0) ?? 0;
    expect(sum).toBeCloseTo(0.5, 6);
  });

  it('finds the starved operating point when a gravity drain cannot keep up with the pump', () => {
    // Pond → drain → chamber → pump (intake −0.8 m) → +0.15 m → 8 m of 44 mm → pond.
    // A narrow drain limits the flow, so the chamber draws down to the intake.
    for (const d of [0.03, 0.04, 0.05, 0.06]) {
      const des = design(
        [pond(), chamber('c', -1.2), { id: 'j', kind: 'junction', name: 'j', elevationM: 0.15 }],
        [
          pipe('drain', 'pond', 'c', d, 5),
          pump('p', 'c', 'j', [[0, 3], [6, 2.6], [10, 1.8], [13, 0.8], [15, 0]]),
          pipe('ret', 'j', 'pond', 0.044, 8, { inletElevationM: 0.15, outletElevationM: -0.2 }),
        ],
      );
      const r = solve(des);
      expect(r.status, `drain ${d * 1000} mm`).toBe('ok');
      expect(Math.abs((r.links.drain?.flowM3s ?? 0) - (r.links.p?.flowM3s ?? 0))).toBeLessThan(1e-8);
      const level = r.nodes.c?.levelM ?? 0;
      if (level < -0.79) expect(r.warnings.some((w) => w.code === 'dry-run' && w.targetId === 'p')).toBe(true);
    }
  });

  it('rejects a measured curve that cannot be used', () => {
    const bad = (points: { flowM3s: number; headLossM: number }[]) =>
      solve(design([pond('a', 0), pond('b', -0.05)], [stage('s', 'a', 'b', { measured: { points } })]));
    expect(bad([{ flowM3s: 0, headLossM: 0 }]).status).toBe('invalid-design');
    expect(bad([{ flowM3s: 0.01, headLossM: 0.02 }, { flowM3s: 0.005, headLossM: 0.01 }]).status).toBe('invalid-design');
    expect(bad([{ flowM3s: 0.01, headLossM: -0.02 }]).status).toBe('invalid-design');
    expect(bad([{ flowM3s: 0.01, headLossM: 0.02 }]).status).toBe('ok');
  });

  it('labels flow beyond the last measured point as extrapolated', () => {
    const points = [{ flowM3s: 0.001, headLossM: 0.001 }, { flowM3s: 0.002, headLossM: 0.004 }];
    const inside = solve(design([pond('a', 0), pond('b', -0.002)], [stage('s', 'a', 'b', { measured: { points } })]));
    expect(inside.links.s?.confidence).toBe('validated');
    const beyond = solve(design([pond('a', 0), pond('b', -0.05)], [stage('s', 'a', 'b', { measured: { points } })]));
    expect(beyond.links.s?.confidence).toBe('extrapolated');
    expect(beyond.warnings.some((w) => w.code === 'outside-validated-range' && w.targetId === 's')).toBe(true);
  });

  it('adds retaining-screen losses as sharp-edged orifices', () => {
    // A lossless stage with one screen: q = Cd · A · √(2gh).
    const h = 0.05;
    const screens = [{ openAreaM2: 0.02, dischargeCoefficient: 0.61 }];
    const r = solve(design([pond('a', 0), pond('b', -h)], [stage('s', 'a', 'b', { screens })]));
    expect(r.links.s?.flowM3s).toBeCloseTo(0.61 * 0.02 * Math.sqrt(2 * GRAVITY * h), 6);
    const blocked = solve(design([pond('a', 0), pond('b', -h)], [stage('s', 'a', 'b', { screens: [{ ...screens[0]!, blockedFraction: 0.5 }] })]));
    expect(blocked.links.s?.flowM3s).toBeCloseTo(0.5 * (r.links.s?.flowM3s ?? 0), 6);
  });

  it('lists every component the engine cannot model yet', () => {
    const d = design(
      [pond('a', 0), chamber('c'), pond('b', -0.05)],
      [stage('k1', 'a', 'c', { stage: { type: 'vortex', diameterM: 1 } }), stage('k2', 'c', 'b', { stage: { type: 'sieve', apertureM: 3e-4, widthM: 0.5, openAreaFraction: 0.3 } })],
    );
    const r = solve(d);
    expect(r.status).toBe('unsupported');
    expect(r.unsupported).toEqual(['k1', 'k2']);
  });
});

describe('energy results', () => {
  it('reports flow per watt and wire-to-water efficiency for a pump with a power curve', () => {
    const p = pump('p', 'c', 'j', [[0, 4], [20, 2.5], [35, 0]]);
    p.power = [{ flowM3s: 0, watts: 150 }, { flowM3s: m3h(35), watts: 250 }];
    const d = design(
      [pond(), chamber('c'), { id: 'j', kind: 'junction', name: 'j', elevationM: -0.5 }],
      [pipe('drain', 'pond', 'c', 0.1, 4), p, pipe('ret', 'j', 'pond', 0.1, 6)],
    );
    const r = solve(d);
    const e = r.links.p?.energy;
    const q = r.links.p?.flowM3s ?? 0;
    expect(e).toBeDefined();
    expect(e?.electricalW).toBeGreaterThan(150);
    expect(e?.electricalW).toBeLessThan(250);
    expect(e?.flowPerWattM3sPerW).toBeCloseTo(q / (e?.electricalW ?? 1), 12);
    // ρ g Q H with H the level rise across the pump.
    const lift = (r.nodes.j?.levelM ?? 0) - (r.nodes.c?.levelM ?? 0);
    expect(e?.hydraulicW).toBeCloseTo(999.1 * GRAVITY * q * lift, 0);
    expect(e?.wireToWater).toBeGreaterThan(0);
    expect(e?.wireToWater).toBeLessThan(1);
  });
});
