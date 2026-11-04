import { describe, expect, it } from 'vitest';
import { waterDensity, waterKinematicViscosity, waterViscosity } from './water';

// Reference values: Tanaka et al. (2001) Table 1 for density;
// IAPWS 2008 / Kestin et al. (1978) tabulations for viscosity at 0.1 MPa.
describe('water density (Tanaka 2001)', () => {
  it.each([
    [0, 999.8428],
    [4, 999.975],
    [10, 999.7026],
    [15, 999.1026],
    [20, 998.2067],
    [25, 997.0479],
    [30, 995.6488],
    [40, 992.2152],
  ])('at %d °C is %f kg/m³', (t, rho) => {
    expect(waterDensity(t)).toBeCloseTo(rho, 2);
  });

  it('peaks near 4 °C', () => {
    expect(waterDensity(4)).toBeGreaterThan(waterDensity(2));
    expect(waterDensity(4)).toBeGreaterThan(waterDensity(6));
  });
});

describe('water viscosity (Kestin 1978)', () => {
  it.each([
    [0, 1.7914e-3],
    [10, 1.3059e-3],
    [15, 1.1375e-3],
    [20, 1.0016e-3],
    [25, 0.8900e-3],
    [30, 0.7972e-3],
    [40, 0.6527e-3],
  ])('at %d °C is %f Pa·s within 0.3%', (t, mu) => {
    expect(Math.abs(waterViscosity(t) / mu - 1)).toBeLessThan(0.003);
  });

  it('nearly doubles from 25 °C to 2 °C', () => {
    const ratio = waterViscosity(2) / waterViscosity(25);
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(1.9);
  });

  it('gives kinematic viscosity about 1.0e-6 m²/s at 20 °C', () => {
    expect(waterKinematicViscosity(20)).toBeCloseTo(1.0034e-6, 9);
  });

  it('rejects temperatures outside 0–40 °C', () => {
    expect(() => waterViscosity(-1)).toThrow(RangeError);
    expect(() => waterDensity(41)).toThrow(RangeError);
    expect(() => waterDensity(Number.NaN)).toThrow(RangeError);
  });
});
