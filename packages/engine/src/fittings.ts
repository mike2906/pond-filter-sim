import type { Fitting, FittingType } from './model';

/**
 * Minor losses in fittings.
 *
 * Elbows, tees and valves use Darby's 3-K method (Darby 1999, "Correlate
 * pressure drops through fittings", Chemical Engineering 106(7)), constants as
 * tabulated at https://neutrium.net/articles/fluid-flow/pressure-loss-from-fittings-3k-method/:
 *
 *   K = K1/Re + K∞ (1 + Kd / Dn^0.3),  Dn = nominal diameter in inches.
 *
 * Pond pipe is specified by internal diameter, so Dn is taken as the internal
 * diameter in inches. At 110 mm PVC this shifts K by well under 1%.
 *
 * Entrances use Hooper's 2-K method (Hooper 1981, Chemical Engineering 88(17)),
 * K = K1/Re + K∞ (1 + 1/D_in). The exit loss is the full velocity head (K = 1).
 */

export interface ThreeK {
  k1: number;
  kInf: number;
  /** in^0.3 */
  kd: number;
}

interface FittingModel {
  label: string;
  method: '3k' | '2k' | 'fixed';
  k: ThreeK;
  /** True where no published coefficient fits a pond fitting and the value is an estimate. */
  estimate?: boolean;
}

export const FITTINGS: Record<FittingType, FittingModel> = {
  // Moulded PVC elbows are short radius; Darby's threaded standard-radius row is the closest match.
  'elbow-90-short': { label: '90° elbow', method: '3k', k: { k1: 800, kInf: 0.14, kd: 4.0 } },
  'elbow-90-long': { label: '90° long-radius bend', method: '3k', k: { k1: 800, kInf: 0.071, kd: 4.2 } },
  'elbow-45': { label: '45° elbow', method: '3k', k: { k1: 500, kInf: 0.071, kd: 4.2 } },
  'tee-run': { label: 'Tee, flow through run', method: '3k', k: { k1: 200, kInf: 0.091, kd: 4.0 } },
  'tee-branch': { label: 'Tee, flow through branch', method: '3k', k: { k1: 500, kInf: 0.274, kd: 4.0 } },
  'ball-valve': { label: 'Ball valve, open', method: '3k', k: { k1: 300, kInf: 0.017, kd: 3.5 } },
  'gate-valve': { label: 'Gate valve, open', method: '3k', k: { k1: 300, kInf: 0.037, kd: 3.9 } },
  'check-valve': { label: 'Swing check valve', method: '3k', k: { k1: 1500, kInf: 0.46, kd: 4.0 } },
  'entrance-sharp': { label: 'Pipe entrance, projecting', method: '2k', k: { k1: 160, kInf: 1.0, kd: 1 } },
  'entrance-flush': { label: 'Pipe entrance, flush square edge', method: '2k', k: { k1: 160, kInf: 0.5, kd: 1 } },
  'entrance-bellmouth': { label: 'Pipe entrance, bellmouth', method: '2k', k: { k1: 160, kInf: 0.04, kd: 1 } },
  exit: { label: 'Pipe exit', method: 'fixed', k: { k1: 0, kInf: 1.0, kd: 0 } },
  // No published coefficient for pond bottom-drain domes: treated as a flush
  // entrance plus a 90° turn. Labelled as an estimate in the UI.
  'bottom-drain-dome': { label: 'Bottom drain dome', method: 'fixed', k: { k1: 0, kInf: 1.0, kd: 0 }, estimate: true },
};

const METRES_PER_INCH = 0.0254;

/** Loss coefficient K for one fitting at a given Reynolds number and internal diameter. */
export function fittingK(type: FittingType, reynolds: number, internalDiameterM: number): number {
  const m = FITTINGS[type];
  const dIn = internalDiameterM / METRES_PER_INCH;
  const viscous = reynolds > 0 ? m.k.k1 / reynolds : 0;
  switch (m.method) {
    case '3k':
      return viscous + m.k.kInf * (1 + m.k.kd / dIn ** 0.3);
    case '2k':
      return viscous + m.k.kInf * (1 + 1 / dIn);
    case 'fixed':
      return m.k.kInf;
  }
}

export interface FittingLoss {
  type: FittingType;
  count: number;
  label: string;
  /** Per fitting */
  k: number;
  /** All `count` fittings, m */
  headLossM: number;
  estimate: boolean;
}

/** Losses of a fitting list at one velocity head. */
export function fittingLosses(fittings: Fitting[], reynolds: number, internalDiameterM: number, velocityHeadM: number): FittingLoss[] {
  return fittings
    .filter((f) => f.count > 0)
    .map((f) => {
      const k = fittingK(f.type, reynolds, internalDiameterM);
      const model = FITTINGS[f.type];
      return {
        type: f.type,
        count: f.count,
        label: f.count > 1 ? `${f.count} × ${model.label}` : model.label,
        k,
        headLossM: f.count * k * velocityHeadM,
        estimate: model.estimate ?? false,
      };
    });
}
