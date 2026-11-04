import { describe, expect, it } from 'vitest';
import { colebrook, frictionFactor, pipeFriction, swameeJain } from './friction';
import { flow } from './units';
import { waterKinematicViscosity } from './water';

const colebrookResidual = (f: number, re: number, rr: number) =>
  1 / Math.sqrt(f) + 2 * Math.log10(rr / 3.7 + 2.51 / (re * Math.sqrt(f)));

describe('Colebrook friction factor', () => {
  it.each([
    [4e3, 0],
    [1e4, 1e-4],
    [1e5, 0],
    [1e5, 1e-3],
    [3e5, 1.5e-5],
    [1e6, 1e-4],
    [1e8, 0.05],
  ])('satisfies the Colebrook equation at Re=%d, ε/D=%f', (re, rr) => {
    expect(Math.abs(colebrookResidual(colebrook(re, rr), re, rr))).toBeLessThan(1e-10);
  });

  // Smooth-pipe values from the Prandtl–Kármán law (Colebrook with ε = 0).
  it.each([
    [1e4, 0.03089],
    [1e5, 0.01799],
    [1e6, 0.01165],
  ])('matches smooth-pipe reference at Re=%d', (re, f) => {
    expect(colebrook(re, 0)).toBeCloseTo(f, 4);
  });

  it('approaches the fully rough limit 1/√f = −2 log10(ε/3.7D)', () => {
    const rr = 0.01;
    const rough = 1 / (2 * Math.log10(rr / 3.7)) ** 2;
    expect(colebrook(1e9, rr) / rough).toBeCloseTo(1, 4);
  });

  it('agrees with Swamee-Jain within 3% over its stated validity range (worst at low Re, high roughness)', () => {
    for (const re of [5e3, 2e4, 1e5, 1e6, 1e7]) {
      for (const rr of [1e-6, 1e-5, 1e-4, 1e-3, 1e-2]) {
        expect(Math.abs(swameeJain(re, rr) / colebrook(re, rr) - 1)).toBeLessThan(0.03);
      }
    }
  });
});

describe('frictionFactor regimes', () => {
  it('is 64/Re when laminar', () => {
    expect(frictionFactor(1000, 1e-3)).toBeCloseTo(0.064, 12);
  });

  it('is continuous through the transition band', () => {
    const rr = 1e-4;
    expect(frictionFactor(2000 + 1e-6, rr)).toBeCloseTo(64 / 2000, 6);
    expect(frictionFactor(4000 - 1e-6, rr)).toBeCloseTo(colebrook(4000, rr), 6);
  });
});

describe('pipeFriction', () => {
  // Cross-check of the review's illustrative table: 100 m³/h, 10 m of 104 mm
  // smooth pipe at 15 °C loses about 76 cm; split over four pipes about 6.3 cm.
  const nu = waterKinematicViscosity(15);
  const loss = (q: number) =>
    pipeFriction({ diameterM: 0.104, lengthM: 10, roughnessM: 1.5e-6, flowM3s: flow.fromM3PerHour(q), kinematicViscosity: nu });

  it('gives about 3.27 m/s and 0.76 m for 100 m³/h in one 104 mm pipe', () => {
    const r = loss(100);
    expect(r.velocityMs).toBeCloseTo(3.27, 2);
    expect(r.frictionLossM).toBeGreaterThan(0.74);
    expect(r.frictionLossM).toBeLessThan(0.78);
  });

  it('gives about 6.3 cm per pipe at 25 m³/h each', () => {
    const r = loss(25);
    expect(r.frictionLossM).toBeGreaterThan(0.060);
    expect(r.frictionLossM).toBeLessThan(0.066);
  });

  it('is antisymmetric in flow direction and zero at zero flow', () => {
    expect(loss(-40).frictionLossM).toBeCloseTo(-loss(40).frictionLossM, 12);
    expect(loss(0).frictionLossM).toBe(0);
  });
});
