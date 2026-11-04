import { describe, expect, it } from 'vitest';
import { swimPondBridge, twinRadialModules } from '../../fixtures/reference-designs';
import type { Design, SolveResult } from '../model';
import { solve } from '../solve';
import { flow } from '../units';

const toM3h = flow.toM3PerHour;

function expectContinuity(d: Design, r: SolveResult) {
  for (const n of d.nodes.filter((n) => n.kind !== 'pond')) {
    let s = 0;
    for (const l of d.links) {
      const q = r.links[l.id]?.flowM3s ?? 0;
      if (l.from === n.id) s -= q;
      if (l.to === n.id) s += q;
    }
    expect(Math.abs(s), `continuity at ${n.id}`).toBeLessThan(1e-8);
  }
}

describe('reference design 1: swim pond filter bridge (stand-in)', () => {
  const r = solve(swimPondBridge);

  it('solves with continuity at every node', () => {
    expect(r.status).toBe('ok');
    expectContinuity(swimPondBridge, r);
  });

  it('draws levels down stage by stage', () => {
    const z = (id: string) => r.nodes[id]?.levelM ?? Number.NaN;
    expect(z('forebay')).toBeLessThan(0);
    expect(z('brushes')).toBeLessThan(z('forebay'));
    expect(z('clean')).toBeLessThan(z('brushes'));
    expect(z('clean-return')).toBeLessThan(z('clean'));
  });

  it('splits the wetland branch off the main flow, solved rather than imposed', () => {
    const main = (r.links['main-1']?.flowM3s ?? 0) + (r.links['main-2']?.flowM3s ?? 0);
    const wetland = r.links['wetland-lift']?.flowM3s ?? 0;
    expect(wetland).toBeGreaterThan(0);
    expect(wetland).toBeLessThan(main / 5);
    expect(r.links['wetland-out']?.flowM3s).toBeCloseTo(wetland, 9);
  });

  it('draws inflow from both pond zones', () => {
    expect(r.links['in-swim-1']?.flowM3s ?? 0).toBeGreaterThan(0);
    expect(r.links['in-planted-1']?.flowM3s ?? 0).toBeGreaterThan(0);
  });

  it('draws down further with half the inlet pipes isolated', () => {
    const half = { ...swimPondBridge, links: swimPondBridge.links.map((l) => (l.id.endsWith('-2') && l.id.startsWith('in-') ? { ...l, isolated: true } : l)) };
    const rh = solve(half);
    expect(rh.status).toBe('ok');
    expect(rh.nodes.forebay?.levelM ?? 0).toBeLessThan(r.nodes.forebay?.levelM ?? 0);
  });

  it('puts the budget on a pond-to-pond path', () => {
    expect(r.criticalPath.length).toBeGreaterThan(2);
    expect(r.budget.reduce((s, b) => s + b.share, 0)).toBeCloseTo(1, 9);
  });
});

describe('reference design 2: twin radial modules (stand-in)', () => {
  it('splits flow equally between identical modules', () => {
    const d = twinRadialModules();
    const r = solve(d);
    expect(r.status).toBe('ok');
    expectContinuity(d, r);
    expect(r.links['media-a']?.flowM3s).toBeCloseTo(r.links['media-b']?.flowM3s ?? 0, 9);
    expect(toM3h(r.links['media-a']?.flowM3s ?? 0)).toBeGreaterThan(10);
  });

  it('sends less flow through a fouled module', () => {
    const r = solve(twinRadialModules({ mediaKB: 400 }));
    expect(r.status).toBe('ok');
    expect(r.links['media-b']?.flowM3s ?? 0).toBeLessThan(r.links['media-a']?.flowM3s ?? 0);
    expect(r.nodes['core-b']?.levelM ?? 0).toBeLessThan(r.nodes['core-a']?.levelM ?? 0);
  });

  it('keeps module A running while module B is isolated for cleaning', () => {
    const both = solve(twinRadialModules());
    const r = solve(twinRadialModules({ isolateB: true }));
    expect(r.status).toBe('ok');
    expect(r.links['media-b']?.flowM3s ?? 0).toBeCloseTo(0, 9);
    expect(r.links['media-a']?.flowM3s ?? 0).toBeGreaterThan(0);
    // With one module's returns off, total flow falls.
    const total = (x: SolveResult) => ['ret-a-1', 'ret-a-2', 'ret-b-1', 'ret-b-2'].reduce((s, id) => s + (x.links[id]?.flowM3s ?? 0), 0);
    expect(total(r)).toBeLessThan(total(both));
  });
});
