import type { UnitSystem } from '@pond/engine';

/**
 * Display units for every kind of quantity the UI shows. The engine is SI; this
 * is the only place SI values become numbers on screen and back.
 */
export type Quantity =
  | 'elevation' // m relative to pond datum
  | 'length' // m, dimensions of chambers and pipes
  | 'diameter' // m, pipe bores and holes
  | 'fine' // m, fibre/bead/mesh sizes
  | 'roughness' // m
  | 'head' // m of water, losses and drawdowns
  | 'area' // m²
  | 'volume' // m³
  | 'flow' // m³/s
  | 'airflow' // m³/s of air, shown as L/min or cfm
  | 'litres' // m³, small volumes shown as L or gallons
  | 'velocity' // m/s
  | 'fraction' // 0–1
  | 'count'
  | 'angle' // degrees
  | 'ratio' // dimensionless
  | 'temperature'; // °C

interface UnitDef {
  unit: string;
  /** SI → display */
  to: (si: number) => number;
  /** display → SI */
  from: (shown: number) => number;
  decimals: number;
  /** Stepper increment in display units. */
  step: number;
}

const id = (x: number) => x;
const scale = (k: number, decimals: number, step: number, unit: string): UnitDef => ({
  unit,
  to: (x) => x * k,
  from: (x) => x / k,
  decimals,
  step,
});

const M_TO_FT = 1 / 0.3048;
const M_TO_IN = 1 / 0.0254;
const M2_TO_FT2 = M_TO_FT * M_TO_FT;
const M3_TO_UK_GAL = 1 / 4.54609e-3;
const M3_TO_US_GAL = 1 / 3.785411784e-3;
const LPM_TO_CFM = 0.0353146667;

const METRIC: Record<Quantity, UnitDef> = {
  elevation: scale(100, 1, 1, 'cm'),
  length: scale(1, 2, 0.05, 'm'),
  diameter: scale(1000, 1, 1, 'mm'),
  fine: scale(1000, 2, 0.1, 'mm'),
  roughness: scale(1000, 4, 0.001, 'mm'),
  head: scale(100, 2, 0.5, 'cm'),
  area: scale(1, 3, 0.05, 'm²'),
  volume: scale(1, 2, 0.5, 'm³'),
  flow: scale(3600, 2, 1, 'm³/h'),
  airflow: scale(60000, 0, 5, 'L/min'),
  litres: scale(1000, 0, 5, 'L'),
  velocity: scale(1, 3, 0.05, 'm/s'),
  fraction: scale(100, 0, 5, '%'),
  count: { unit: '', to: id, from: id, decimals: 0, step: 1 },
  angle: { unit: '°', to: id, from: id, decimals: 0, step: 5 },
  ratio: { unit: '', to: id, from: id, decimals: 2, step: 0.1 },
  temperature: { unit: '°C', to: id, from: id, decimals: 1, step: 1 },
};

function imperial(gallon: number, gallonLabel: string): Record<Quantity, UnitDef> {
  return {
    ...METRIC,
    elevation: scale(M_TO_IN, 1, 0.5, 'in'),
    length: scale(M_TO_FT, 2, 0.1, 'ft'),
    diameter: scale(M_TO_IN, 2, 0.25, 'in'),
    fine: scale(M_TO_IN, 3, 0.01, 'in'),
    roughness: scale(M_TO_IN, 5, 0.0001, 'in'),
    head: scale(M_TO_IN, 2, 0.25, 'in'),
    area: scale(M2_TO_FT2, 2, 0.5, 'ft²'),
    volume: scale(gallon, 0, 50, gallonLabel),
    flow: scale(gallon * 3600, 0, 100, `${gallonLabel}/h`),
    airflow: scale(60000 * LPM_TO_CFM, 2, 0.1, 'cfm'),
    litres: scale(gallon, 1, 1, gallonLabel),
    velocity: scale(M_TO_FT, 2, 0.1, 'ft/s'),
    temperature: { unit: '°F', to: (c) => (c * 9) / 5 + 32, from: (f) => ((f - 32) * 5) / 9, decimals: 1, step: 2 },
  };
}

const SYSTEMS: Record<UnitSystem, Record<Quantity, UnitDef>> = {
  metric: METRIC,
  'imperial-uk': imperial(M3_TO_UK_GAL, 'UK gal'),
  'imperial-us': imperial(M3_TO_US_GAL, 'US gal'),
};

export function unitDef(q: Quantity, system: UnitSystem): UnitDef {
  return SYSTEMS[system][q];
}

export function toDisplay(si: number, q: Quantity, system: UnitSystem): number {
  return unitDef(q, system).to(si);
}

export function fromDisplay(shown: number, q: Quantity, system: UnitSystem): number {
  return unitDef(q, system).from(shown);
}

/** Round to the unit's decimals, trimming trailing zeros for inputs. */
export function roundShown(shown: number, q: Quantity, system: UnitSystem): number {
  const d = unitDef(q, system).decimals;
  return Number(shown.toFixed(d));
}

export interface Formatted {
  value: string;
  unit: string;
}

/** Format an SI value for display. Signed quantities (elevation, head) keep their sign. */
export function fmt(si: number | undefined, q: Quantity, system: UnitSystem, opts: { signed?: boolean } = {}): Formatted {
  const def = unitDef(q, system);
  if (si === undefined || !Number.isFinite(si)) return { value: '–', unit: def.unit };
  const shown = def.to(si);
  let decimals = def.decimals;
  // Small values get one more decimal so a 3 mm drawdown doesn't read as 0.
  if (Math.abs(shown) > 0 && Math.abs(shown) < 1 && decimals < 3) decimals += 1;
  if (Math.abs(shown) >= 1000) decimals = 0;
  const text = shown.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const value = opts.signed && shown > 0 ? `+${text}` : text.replace('-', '−');
  return { value, unit: def.unit };
}

export function fmtText(si: number | undefined, q: Quantity, system: UnitSystem, opts: { signed?: boolean } = {}): string {
  const f = fmt(si, q, system, opts);
  return f.unit ? `${f.value} ${f.unit}` : f.value;
}
