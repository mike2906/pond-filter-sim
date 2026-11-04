import { describe, expect, it } from 'vitest';
import { flow, length, temperature } from './units';

describe('unit conversions', () => {
  it('converts m³/h both ways', () => {
    expect(flow.fromM3PerHour(36)).toBeCloseTo(0.01, 12);
    expect(flow.toM3PerHour(flow.fromM3PerHour(12.5))).toBeCloseTo(12.5, 12);
  });

  it('uses exact UK and US gallon definitions', () => {
    // 1000 UK gal/h = 4.54609 m³/h; 1000 US gal/h = 3.785411784 m³/h
    expect(flow.toM3PerHour(flow.fromUkGallonsPerHour(1000))).toBeCloseTo(4.54609, 10);
    expect(flow.toM3PerHour(flow.fromUsGallonsPerHour(1000))).toBeCloseTo(3.785411784, 10);
  });

  it('round-trips litres per minute (air flow)', () => {
    expect(flow.toLitresPerMinute(flow.fromLitresPerMinute(60))).toBeCloseTo(60, 12);
  });

  it('converts lengths and temperatures', () => {
    expect(length.fromInches(4)).toBeCloseTo(0.1016, 12);
    expect(length.toMm(length.fromFeet(1))).toBeCloseTo(304.8, 10);
    expect(temperature.toFahrenheit(15)).toBeCloseTo(59, 12);
    expect(temperature.fromFahrenheit(212)).toBeCloseTo(100, 12);
  });
});
