import { temperature, type UnitSystem } from '@pond/engine';

const KG_M3_TO_LB_FT3 = 0.0624279606;

export function formatTemperature(tempC: number, units: UnitSystem) {
  return units === 'metric'
    ? { value: tempC.toFixed(1), unit: '°C' }
    : { value: temperature.toFahrenheit(tempC).toFixed(1), unit: '°F' };
}

export function formatDensity(kgM3: number, units: UnitSystem) {
  return units === 'metric'
    ? { value: kgM3.toFixed(1), unit: 'kg/m³' }
    : { value: (kgM3 * KG_M3_TO_LB_FT3).toFixed(2), unit: 'lb/ft³' };
}

/** Viscosity is shown in mPa·s (= centipoise) in every unit system. */
export function formatViscosity(paS: number) {
  return { value: (paS * 1000).toFixed(3), unit: 'mPa·s' };
}
