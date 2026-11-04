/**
 * Properties of liquid water at atmospheric pressure.
 *
 * All inputs and outputs are SI except where a name says otherwise.
 * Valid range for pond use: 0 to 40 °C.
 */

export const GRAVITY = 9.80665; // m/s², standard gravity

/** Valid temperature range of the correlations below, in °C. */
export const WATER_T_MIN_C = 0;
export const WATER_T_MAX_C = 40;

function checkRange(tempC: number): void {
  if (!Number.isFinite(tempC) || tempC < WATER_T_MIN_C || tempC > WATER_T_MAX_C) {
    throw new RangeError(
      `Water temperature ${tempC} °C is outside the supported range ${WATER_T_MIN_C}–${WATER_T_MAX_C} °C`,
    );
  }
}

/**
 * Density of air-free water at 101.325 kPa, kg/m³.
 *
 * Tanaka, Girard, Davis, Peuto and Bignell (2001), "Recommended table for the
 * density of water between 0 °C and 40 °C based on recent experimental reports",
 * Metrologia 38, 301–309. Stated uncertainty about 1 ppm.
 */
export function waterDensity(tempC: number): number {
  checkRange(tempC);
  const a1 = -3.983035;
  const a2 = 301.797;
  const a3 = 522528.9;
  const a4 = 69.34881;
  const a5 = 999.97495;
  const t = tempC;
  return a5 * (1 - ((t + a1) ** 2 * (t + a2)) / (a3 * (t + a4)));
}

/**
 * Dynamic viscosity of water at atmospheric pressure, Pa·s.
 *
 * Kestin, Sokolov and Wakeham (1978), "Viscosity of liquid water in the range
 * −8 °C to 150 °C", J. Phys. Chem. Ref. Data 7(3), 941–948, equation for
 * 0–40 °C relative to the 20 °C value of 1.0016 mPa·s. Agrees with the
 * IAPWS 2008 formulation to about 0.1% over this range.
 */
export function waterViscosity(tempC: number): number {
  checkRange(tempC);
  const mu20 = 1.0016e-3;
  const d = 20 - tempC;
  const log10Ratio = (d / (tempC + 96)) * (1.2364 - 1.37e-3 * d + 5.7e-6 * d * d);
  return mu20 * 10 ** log10Ratio;
}

/** Kinematic viscosity of water, m²/s: ν = μ/ρ from Kestin et al. (1978) and Tanaka et al. (2001) above. */
export function waterKinematicViscosity(tempC: number): number {
  return waterViscosity(tempC) / waterDensity(tempC);
}

export interface WaterProperties {
  tempC: number;
  /** kg/m³ */
  density: number;
  /** Pa·s */
  viscosity: number;
  /** m²/s */
  kinematicViscosity: number;
}

/** Density, viscosity and kinematic viscosity together; sources as for the individual functions above. */
export function waterProperties(tempC: number): WaterProperties {
  const density = waterDensity(tempC);
  const viscosity = waterViscosity(tempC);
  return { tempC, density, viscosity, kinematicViscosity: viscosity / density };
}
