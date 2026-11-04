import { GRAVITY } from './water';

/**
 * Darcy friction factor for full-bore pipe flow.
 *
 * - Laminar (Re ≤ 2000): f = 64/Re.
 * - Turbulent (Re ≥ 4000): Colebrook-White (1939), solved by Newton iteration
 *   on x = 1/√f from the Swamee-Jain (1976) explicit estimate.
 * - 2000 < Re < 4000: linear blend between the two, so the system curve has
 *   no jump. Real flow in this band is unstable; the blend is a modelling choice.
 *
 * @param re Reynolds number (≥ 0)
 * @param relRoughness ε/D (≥ 0)
 */
export function frictionFactor(re: number, relRoughness: number): number {
  if (!(re >= 0) || !(relRoughness >= 0)) throw new RangeError('Reynolds number and roughness must be non-negative');
  if (re === 0) return Number.POSITIVE_INFINITY;
  const RE_LAM = 2000;
  const RE_TURB = 4000;
  if (re <= RE_LAM) return 64 / re;
  if (re >= RE_TURB) return colebrook(re, relRoughness);
  const t = (re - RE_LAM) / (RE_TURB - RE_LAM);
  return (1 - t) * (64 / RE_LAM) + t * colebrook(RE_TURB, relRoughness);
}

/** Swamee and Jain (1976) explicit approximation, within about 1% of Colebrook for most pond pipes, up to 3% at low Re with rough pipe. */
export function swameeJain(re: number, relRoughness: number): number {
  const a = Math.log10(relRoughness / 3.7 + 5.74 / re ** 0.9);
  return 0.25 / (a * a);
}

/** Colebrook-White, 1/√f = −2 log10(ε/3.7D + 2.51/(Re √f)). Converges to 1e-12 in a few steps. */
export function colebrook(re: number, relRoughness: number): number {
  let x = 1 / Math.sqrt(swameeJain(re, relRoughness));
  const a = relRoughness / 3.7;
  const b = 2.51 / re;
  for (let i = 0; i < 50; i++) {
    const inner = a + b * x;
    const g = x + 2 * Math.log10(inner);
    const dg = 1 + (2 * b) / (inner * Math.LN10);
    const step = g / dg;
    x -= step;
    if (Math.abs(step) < 1e-12 * x) break;
  }
  return 1 / (x * x);
}

export interface PipeFlowInput {
  /** Internal diameter, m */
  diameterM: number;
  lengthM: number;
  roughnessM: number;
  /** Volumetric flow, m³/s; sign gives direction */
  flowM3s: number;
  /** Kinematic viscosity, m²/s */
  kinematicViscosity: number;
}

export interface PipeFlowResult {
  velocityMs: number;
  reynolds: number;
  frictionFactor: number;
  /** Velocity head v²/2g, m */
  velocityHeadM: number;
  /** Darcy-Weisbach friction loss, m, same sign as the flow */
  frictionLossM: number;
}

/** Darcy-Weisbach friction loss: h_f = f (L/D) v²/2g. */
export function pipeFriction({ diameterM, lengthM, roughnessM, flowM3s, kinematicViscosity }: PipeFlowInput): PipeFlowResult {
  if (!(diameterM > 0)) throw new RangeError('Pipe diameter must be positive');
  const area = (Math.PI * diameterM * diameterM) / 4;
  const v = flowM3s / area;
  const speed = Math.abs(v);
  const re = (speed * diameterM) / kinematicViscosity;
  const velocityHeadM = (speed * speed) / (2 * GRAVITY);
  if (speed === 0) {
    return { velocityMs: 0, reynolds: 0, frictionFactor: Number.POSITIVE_INFINITY, velocityHeadM: 0, frictionLossM: 0 };
  }
  const f = frictionFactor(re, roughnessM / diameterM);
  const loss = f * (lengthM / diameterM) * velocityHeadM;
  return { velocityMs: v, reynolds: re, frictionFactor: f, velocityHeadM, frictionLossM: Math.sign(flowM3s) * loss };
}
