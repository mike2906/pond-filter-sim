import { describe, expect, it } from 'vitest';
import { fmt, fromDisplay, toDisplay } from '../units/quantities';

describe('display units', () => {
  it('shows flow in m³/h and UK/US gallons per hour', () => {
    const q = 10 / 3600; // 10 m³/h
    expect(toDisplay(q, 'flow', 'metric')).toBeCloseTo(10, 10);
    expect(toDisplay(q, 'flow', 'imperial-uk')).toBeCloseTo(2199.69, 1); // 10 m³ = 2199.69 UK gal
    expect(toDisplay(q, 'flow', 'imperial-us')).toBeCloseTo(2641.72, 1); // 10 m³ = 2641.72 US gal
  });

  it('round-trips every quantity', () => {
    for (const sys of ['metric', 'imperial-uk', 'imperial-us'] as const) {
      for (const q of ['elevation', 'length', 'diameter', 'head', 'area', 'flow', 'airflow', 'velocity', 'temperature', 'litres'] as const) {
        expect(fromDisplay(toDisplay(0.1234, q, sys), q, sys)).toBeCloseTo(0.1234, 10);
      }
    }
  });

  it('formats heads with enough precision for millimetre drawdowns and a real minus sign', () => {
    expect(fmt(0.003, 'head', 'metric')).toEqual({ value: '0.300', unit: 'cm' });
    expect(fmt(-0.05, 'elevation', 'metric').value).toBe('−5.0');
    expect(fmt(0.05, 'elevation', 'metric', { signed: true }).value).toBe('+5.0');
    expect(fmt(Number.NaN, 'flow', 'metric').value).toBe('–');
  });

  it('converts 110 mm PVC bore to inches', () => {
    expect(toDisplay(0.1036, 'diameter', 'imperial-us')).toBeCloseTo(4.079, 3);
  });
});
