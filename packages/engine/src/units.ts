/**
 * Unit conversions. The engine works in SI throughout; these helpers are for
 * the boundary between the engine and the UI only.
 */

export type UnitSystem = 'metric' | 'imperial-uk' | 'imperial-us';

const SECONDS_PER_HOUR = 3600;
const UK_GALLON_M3 = 4.54609e-3; // exact by definition
const US_GALLON_M3 = 3.785411784e-3; // exact by definition
const INCH_M = 0.0254; // exact
const FOOT_M = 0.3048; // exact

export const flow = {
  /** m³/h → m³/s */
  fromM3PerHour: (q: number) => q / SECONDS_PER_HOUR,
  toM3PerHour: (q: number) => q * SECONDS_PER_HOUR,
  fromLitresPerHour: (q: number) => q / 1000 / SECONDS_PER_HOUR,
  toLitresPerHour: (q: number) => q * 1000 * SECONDS_PER_HOUR,
  fromLitresPerMinute: (q: number) => q / 1000 / 60,
  toLitresPerMinute: (q: number) => q * 1000 * 60,
  fromUkGallonsPerHour: (q: number) => (q * UK_GALLON_M3) / SECONDS_PER_HOUR,
  toUkGallonsPerHour: (q: number) => (q / UK_GALLON_M3) * SECONDS_PER_HOUR,
  fromUsGallonsPerHour: (q: number) => (q * US_GALLON_M3) / SECONDS_PER_HOUR,
  toUsGallonsPerHour: (q: number) => (q / US_GALLON_M3) * SECONDS_PER_HOUR,
} as const;

export const length = {
  fromMm: (x: number) => x / 1000,
  toMm: (x: number) => x * 1000,
  fromInches: (x: number) => x * INCH_M,
  toInches: (x: number) => x / INCH_M,
  fromFeet: (x: number) => x * FOOT_M,
  toFeet: (x: number) => x / FOOT_M,
} as const;

export const temperature = {
  fromFahrenheit: (f: number) => ((f - 32) * 5) / 9,
  toFahrenheit: (c: number) => (c * 9) / 5 + 32,
} as const;
