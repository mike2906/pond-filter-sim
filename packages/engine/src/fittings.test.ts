import { describe, expect, it } from 'vitest';
import { fittingK, fittingLosses } from './fittings';

const inch = 0.0254;

describe('Darby 3-K fittings', () => {
  it('reproduces the 3-K formula for a 4 in standard elbow', () => {
    // K = 800/Re + 0.14 (1 + 4/4^0.3)
    const re = 306_900;
    const expected = 800 / re + 0.14 * (1 + 4 / 4 ** 0.3);
    expect(fittingK('elbow-90-short', re, 4 * inch)).toBeCloseTo(expected, 12);
  });

  it('gives K about 0.5 for a 110 mm PVC elbow in turbulent flow', () => {
    const k = fittingK('elbow-90-short', 3e5, 0.1036);
    expect(k).toBeGreaterThan(0.45);
    expect(k).toBeLessThan(0.55);
  });

  it('has smaller K for larger fittings and long-radius bends', () => {
    expect(fittingK('elbow-90-short', 3e5, 0.2)).toBeLessThan(fittingK('elbow-90-short', 3e5, 0.05));
    expect(fittingK('elbow-90-long', 3e5, 0.1)).toBeLessThan(fittingK('elbow-90-short', 3e5, 0.1));
  });

  it('rises at low Reynolds number', () => {
    expect(fittingK('ball-valve', 500, 0.05)).toBeGreaterThan(fittingK('ball-valve', 1e6, 0.05) + 0.5);
  });
});

describe('entrance and exit', () => {
  it('approaches the textbook values in turbulent flow at large size', () => {
    expect(fittingK('entrance-flush', 1e7, 0.5)).toBeCloseTo(0.5 * (1 + 1 / (0.5 / inch)), 4);
    expect(fittingK('exit', 1e5, 0.1)).toBe(1);
  });
});

describe('fittingLosses', () => {
  it('multiplies by count and labels groups', () => {
    const [loss] = fittingLosses([{ type: 'elbow-90-long', count: 2 }], 2e5, 0.1, 0.25);
    expect(loss?.label).toBe('2 × 90° long-radius bend');
    expect(loss?.headLossM).toBeCloseTo(2 * fittingK('elbow-90-long', 2e5, 0.1) * 0.25, 12);
  });

  it('flags estimated coefficients', () => {
    const [loss] = fittingLosses([{ type: 'bottom-drain-dome', count: 1 }], 2e5, 0.1, 0.1);
    expect(loss?.estimate).toBe(true);
  });
});
