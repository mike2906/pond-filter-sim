import { describe, expect, it } from 'vitest';
import { goalSeek, sweep } from '../solver/explore';
import { totalFlow } from '../solver/metrics';
import { previewSolve } from '../solver/preview';
import { runSolve, runSolveLikely } from '../solver/run';
import { TEMPLATES } from '../templates';

const byId = (id: string) => TEMPLATES.find((t) => t.id === id)!.design;

describe('solving templates', () => {
  it('solves every template with the network solver, flagging placeholders', () => {
    for (const t of TEMPLATES) {
      const s = runSolve(t.design);
      expect(s.source, t.id).not.toBe('preview');
      expect(s.result.status, t.id).toBe('ok');
      if (t.id !== 'blank') expect(totalFlow(t.design, s.result), t.id).toBeGreaterThan(0);
    }
  });

  it('labels stand-in elements as unvalidated placeholders', () => {
    const d = byId('gravity-pump');
    const s = runSolve(d);
    expect(s.source).toBe('mixed');
    expect(s.placeholders).toEqual(expect.arrayContaining(['brush-bank', 'k1-bed']));
    expect(s.result.links['k1-bed']?.confidence).toBe('unvalidated');
    expect(s.result.links['k1-bed']?.basis).toMatch(/milestone 4/);
  });

  it('gives an airlift design a low–high band', () => {
    const s = runSolve(byId('gravity-airlift'));
    const q = (r: typeof s.result) => totalFlow(byId('gravity-airlift'), r);
    expect(q(s.cases.low)).toBeLessThan(q(s.cases.likely));
    expect(q(s.cases.high)).toBeGreaterThan(q(s.cases.likely));
  });

  it('chamber levels fall along a gravity train', () => {
    const r = runSolve(byId('gravity-pump')).result;
    const lv = (id: string) => r.nodes[id]!.levelM;
    expect(lv('vortex')).toBeLessThan(0);
    expect(lv('brushes')).toBeLessThan(lv('vortex'));
    expect(lv('pump-bay')).toBeLessThan(lv('k1'));
  });
});

describe('sweeps and goal seek', () => {
  const d = byId('gravity-pump');
  const param = { elementId: 'drain', path: 'internalDiameterM' };

  it('a bigger drain line never reduces flow', () => {
    const pts = sweep(d, param, 0.07, 0.15, 8, { kind: 'total-flow' }, runSolveLikely);
    expect(pts.every((p) => p.ok)).toBe(true);
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.y).toBeGreaterThanOrEqual(pts[i - 1]!.y - 1e-9);
  });

  it('finds the drain bore that gives a target drawdown', () => {
    const metric = { kind: 'drawdown' as const, id: 'pump-bay' };
    const r = goalSeek(d, param, 0.06, 0.2, metric, 0.05, runSolveLikely);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.achieved).toBeCloseTo(0.05, 3);
  });

  it('reports when a target is out of reach', () => {
    const r = goalSeek(d, param, 0.06, 0.2, { kind: 'total-flow' }, 1, runSolveLikely);
    expect(r.ok).toBe(false);
  });
});

describe('preview fallback', () => {
  it('explains a design with nothing to move water', () => {
    const r = previewSolve(byId('blank'));
    expect(r.status).toBe('no-operating-point');
  });
});
