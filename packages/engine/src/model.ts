/**
 * Shared design schema and solver result types.
 *
 * This is the contract between the engine and the UI. Conventions:
 * - SI units everywhere: metres, m³/s, Pa, seconds, kg.
 * - Elevations are metres relative to the pond datum (pond surface = 0), positive up.
 * - A design is a hydraulic network: nodes hold water at an unknown level,
 *   links carry flow between two nodes.
 *
 * Schema version 1 is a draft until milestone 2 ships; breaking changes bump
 * `schemaVersion` and add a migration.
 */

import { WATER_T_MAX_C, WATER_T_MIN_C } from './water';

export type Id = string;

export const SCHEMA_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Design
// ---------------------------------------------------------------------------

export interface Design {
  schemaVersion: typeof SCHEMA_VERSION;
  name: string;
  water: { tempC: number };
  nodes: Node[];
  links: Link[];
  /** Plan-view placement, keyed by node or link id. Pure presentation. */
  layout?: Record<Id, PlanPlacement>;
  notes?: string;
}

export interface PlanPlacement {
  /** Centre position in plan, metres. */
  xM: number;
  yM: number;
  rotationDeg?: number;
}

// ----- Nodes ---------------------------------------------------------------

export type Node = PondNode | ChamberNode | JunctionNode;

/** A large body of water whose level is fixed. Several pond zones can share a level. */
export interface PondNode {
  id: Id;
  kind: 'pond';
  name: string;
  /** Surface level relative to datum; normally 0. */
  levelM: number;
  surfaceAreaM2: number;
  volumeM3: number;
  /** Lowest point, used for drawing and sanity checks. */
  floorM: number;
}

export type PlanShape =
  | { type: 'rect'; lengthM: number; widthM: number }
  | { type: 'round'; diameterM: number };

/** An open chamber with a free surface whose level the solver finds. */
export interface ChamberNode {
  id: Id;
  kind: 'chamber';
  name: string;
  shape: PlanShape;
  floorM: number;
  /** Top of the lowest wall; water above this overflows. */
  wallCrestM: number;
}

/** A pressurised point with no free surface (bead filter housing, manifold). */
export interface JunctionNode {
  id: Id;
  kind: 'junction';
  name: string;
  elevationM: number;
}

// ----- Links ---------------------------------------------------------------

export type Link =
  | PipeLink
  | OpeningLink
  | WeirLink
  | GrilleLink
  | StageLink
  | ValveLink
  | PumpLink
  | AirliftLink;

interface LinkBase {
  id: Id;
  name?: string;
  /** Upstream node in the normal flow direction. Solved flow may be negative (reverse). */
  from: Id;
  to: Id;
  /** Closed for maintenance; carries no flow. */
  isolated?: boolean;
}

export type FittingType =
  | 'elbow-90-short'
  | 'elbow-90-long'
  | 'elbow-45'
  | 'tee-run'
  | 'tee-branch'
  | 'ball-valve'
  | 'gate-valve'
  | 'check-valve'
  | 'entrance-sharp'
  | 'entrance-flush'
  | 'entrance-bellmouth'
  | 'exit'
  | 'bottom-drain-dome';

export interface Fitting {
  type: FittingType;
  count: number;
}

export interface PipeLink extends LinkBase {
  kind: 'pipe';
  internalDiameterM: number;
  lengthM: number;
  /** Absolute roughness, m. PVC ≈ 1.5e-6. */
  roughnessM: number;
  fittings: Fitting[];
  /** Elevations of the two ends, for drawing and air-lock checks. */
  inletElevationM: number;
  outletElevationM: number;
  /** Number of identical pipes in parallel. */
  parallelCount?: number;
}

/** Hole or slot through a wall. Submerged or free-falling depending on levels. */
export interface OpeningLink extends LinkBase {
  kind: 'opening';
  shape: { type: 'rect'; widthM: number; heightM: number } | { type: 'circle'; diameterM: number };
  /** Bottom edge of the opening. */
  invertM: number;
  dischargeCoefficient?: number;
  count?: number;
}

/** Sharp-crested weir over a wall, or a removable standpipe. */
export interface WeirLink extends LinkBase {
  kind: 'weir';
  crestM: number;
  widthM: number;
  /** A standpipe that, when fitted, raises the crest to `fittedCrestM`. */
  standpipe?: { fitted: boolean; fittedCrestM: number };
}

/** Bar screen, intake grille or fish barrier. */
export interface GrilleLink extends LinkBase {
  kind: 'grille';
  faceAreaM2: number;
  barThicknessM: number;
  barSpacingM: number;
  /** Kirschmer shape factor (2.42 square bars, 1.79 round bars). */
  shapeFactor: number;
  angleDeg: number;
  blockedFraction: number;
}

export interface ValveLink extends LinkBase {
  kind: 'valve';
  valveType: 'ball' | 'gate' | 'butterfly' | 'slide';
  internalDiameterM: number;
  openFraction: number;
}

export interface CurvePoint {
  /** m³/s */
  flowM3s: number;
  /** m of head */
  headM: number;
}

export interface PumpLink extends LinkBase {
  kind: 'pump';
  model?: string;
  curve: CurvePoint[];
  /** Optional power curve, W against flow. */
  power?: { flowM3s: number; watts: number }[];
  /** 1 = rated speed. Affinity laws scale the curve. */
  speedFraction: number;
  intakeElevationM: number;
}

export type AirliftOutlet =
  | { type: 'open-top'; elevationM: number }
  | { type: 'vented-tee'; teeElevationM: number; returnPipe: Omit<PipeLink, 'id' | 'kind' | 'from' | 'to'> }
  | { type: 'elbow-90'; elevationM: number; horizontalLengthM: number }
  | { type: 'submerged'; elevationM: number };

export type AirSupply =
  | { type: 'fixed'; airFlowM3s: number }
  /** Delivered free-air flow against back-pressure (gauge). */
  | { type: 'air-pump'; model?: string; curve: { pressurePa: number; airFlowM3s: number }[] };

export interface AirliftLink extends LinkBase {
  kind: 'airlift';
  riserInternalDiameterM: number;
  /** Bottom of the riser (water inlet). */
  inletElevationM: number;
  /** Where air enters the riser. */
  injectionElevationM: number;
  injector: 'open-pipe' | 'diffuser' | 'collar';
  injectorPressureDropPa?: number;
  outlet: AirliftOutlet;
  airSupply: AirSupply;
  airLine: { internalDiameterM: number; lengthM: number };
  /** Airlifts sharing one air pump list the same `airGroup`. */
  airGroup?: string;
  count?: number;
}

// ----- Stages --------------------------------------------------------------

export type FlowDirection = 'up' | 'down' | 'cross' | 'radial-in' | 'radial-out';

/** Head-loss points measured by the user, which override the theoretical model. */
export interface MeasuredCurve {
  points: { flowM3s: number; headLossM: number }[];
}

export type MediaGeometry =
  | { type: 'planar'; flowAreaM2: number; depthM: number }
  | { type: 'radial'; outerRadiusM: number; innerRadiusM: number; activeHeightM: number };

export type Stage =
  | { type: 'vortex'; diameterM: number; vortexFactor?: number }
  | { type: 'settlement'; baffles: number }
  | { type: 'sieve'; apertureM: number; widthM: number; openAreaFraction: number }
  | { type: 'drum'; meshM: number; screenAreaM2: number; openAreaFraction: number; backwashSetpointM: number; washVolumeM3: number }
  | { type: 'brushes'; brushDiameterM: number; bristleDiameterM: number; count: number; rows: number; spacingM: number; lengthM: number }
  | { type: 'matting'; fibreDiameterM: number; porosity: number; geometry: MediaGeometry }
  | { type: 'static-media'; media: 'k1' | 'helix' | 'other'; voidage: number; equivalentDiameterM: number; sphericity: number; floating: boolean; geometry: MediaGeometry; mediaVolumeM3?: number }
  | { type: 'moving-bed'; media: 'k1' | 'helix' | 'other'; fillFraction: number; screenAreaM2: number; screenOpenFraction: number; aerationAirFlowM3s: number }
  | { type: 'beads'; beadDiameterM: number; voidage: number; bedDepthM: number; bedAreaM2: number; valveK: number }
  | { type: 'gravel-bed'; particleDiameterM: number; voidage: number; geometry: MediaGeometry; manifold?: { portDiameterM: number; portCount: number } }
  | { type: 'generic'; k?: number; referenceAreaM2?: number; fixedHeadLossM?: number };

/** Flow through a filter stage, between the chamber (or zone) before it and the one after it. */
export interface StageLink extends LinkBase {
  kind: 'stage';
  stage: Stage;
  direction: FlowDirection;
  /** Optional measured override; when present it replaces the theoretical head-loss model. */
  measured?: MeasuredCurve;
  /** Perforated retaining screens either side, as orifices on their open area. */
  screens?: { openAreaM2: number; dischargeCoefficient?: number; blockedFraction?: number }[];
}

// ---------------------------------------------------------------------------
// Solver result
// ---------------------------------------------------------------------------

export type SolveStatus = 'ok' | 'no-operating-point' | 'did-not-converge' | 'invalid-design';

/**
 * How far a value can be trusted.
 * validated: inside the range of published data the model was tested on.
 * extrapolated: the model is sound but the design is outside its tested range.
 * unvalidated: no data supports this model at all (e.g. clogging, some airlifts).
 */
export type Confidence = 'validated' | 'extrapolated' | 'unvalidated';

export interface NodeResult {
  /** Water level (free surface) or pressure head (junction), m relative to datum. */
  levelM: number;
  /** Level minus wall crest; positive means overflowing. Chambers only. */
  freeboardM?: number;
  /** Weakest confidence of any model this level depends on. */
  confidence: Confidence;
}

export interface LinkResult {
  /** Positive in the from → to direction. */
  flowM3s: number;
  /** Energy loss across the link, m. Pumps and airlifts report the head they add as negative. */
  headLossM: number;
  /** Representative velocity, m/s (pipe bore, media face, opening). */
  velocityMs?: number;
  /** Free-surface links only. */
  regime?: 'submerged' | 'free' | 'drowned';
  /** Airlifts only. */
  airlift?: { airFlowM3s: number; injectionPressurePa: number; efficiency: number };
  /** Pumps only. */
  pump?: { headM: number; watts?: number };
  /** Confidence of this link's own model. */
  confidence: Confidence;
  /** What the model is, e.g. "Darcy-Weisbach + 3-K fittings" or "drift-flux, Kataoka-Ishii". */
  basis: string;
}

export type LossPartKind =
  | 'friction'
  | 'fitting'
  | 'entrance'
  | 'exit'
  | 'opening'
  | 'weir'
  | 'grille'
  | 'screen'
  | 'media'
  | 'valve'
  | 'outlet';

/** One component of a link's head loss, e.g. pipe friction or a single fitting. */
export interface LossPart {
  kind: LossPartKind;
  /** Human-readable, e.g. "Friction, 6 m of 110 mm" or "2 × long-radius 90° elbow". */
  label: string;
  headLossM: number;
}

export interface BudgetEntry {
  linkId: Id;
  headLossM: number;
  /** Share of the total head loss along the critical path, 0–1. */
  share: number;
  /** Breakdown of this link's loss; parts sum to headLossM. */
  parts: LossPart[];
}

export type WarningCode =
  | 'overflow'
  | 'dry-run'
  | 'airlift-stall'
  | 'low-submergence'
  | 'drowned-weir'
  | 'bypass'
  | 'velocity-high'
  | 'no-operating-point'
  | 'outside-validated-range'
  | 'invalid-design';

export interface Warning {
  code: WarningCode;
  severity: 'info' | 'warning' | 'critical';
  /** Node or link the warning is about. */
  targetId?: Id;
  message: string;
}

export interface SolveResult {
  status: SolveStatus;
  nodes: Record<Id, NodeResult>;
  links: Record<Id, LinkResult>;
  /**
   * Link ids, in flow order, of the path from pond back to pond that carries the
   * most head loss. The budget is computed along this path.
   */
  criticalPath: Id[];
  /** Largest losses first. */
  budget: BudgetEntry[];
  warnings: Warning[];
  iterations: number;
  /** Max continuity residual at the solution, m³/s. */
  residualM3s: number;
}

/**
 * Uncertainty is shown by solving the whole design several times with each
 * uncertain model at its low, likely and high setting, so every case stays
 * physically consistent (a low airlift flow comes with the levels it causes).
 * The UI draws any value as a band from `low` to `high` around `likely`.
 * Cases are named by flow: `low` is the case with the lowest total flow.
 */
export interface UncertainSolveResult {
  likely: SolveResult;
  low: SolveResult;
  high: SolveResult;
  /** Which uncertain models were varied, and how, in plain language. */
  varied: string[];
}

export interface SolveOptions {
  /** A previous result to start from (continuation); speeds up and stabilises re-solves. */
  initial?: SolveResult;
  maxIterations?: number;
}

// ---------------------------------------------------------------------------
// Structural checks
// ---------------------------------------------------------------------------

export interface DesignIssue {
  path: string;
  message: string;
  /** Node or link the issue is about, when there is one. */
  targetId?: Id;
}

/** Checks ids and references. Physical validation comes with the solver. */
export function checkDesign(design: Design): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const ids = new Set<Id>();
  const nodeIds = new Set<Id>();

  design.nodes.forEach((n, i) => {
    if (ids.has(n.id)) issues.push({ path: `nodes[${i}].id`, message: `Duplicate id "${n.id}"`, targetId: n.id });
    ids.add(n.id);
    nodeIds.add(n.id);
  });
  design.links.forEach((l, i) => {
    if (ids.has(l.id)) issues.push({ path: `links[${i}].id`, message: `Duplicate id "${l.id}"`, targetId: l.id });
    ids.add(l.id);
    if (!nodeIds.has(l.from)) issues.push({ path: `links[${i}].from`, message: `Unknown node "${l.from}"`, targetId: l.id });
    if (!nodeIds.has(l.to)) issues.push({ path: `links[${i}].to`, message: `Unknown node "${l.to}"`, targetId: l.id });
    if (l.from === l.to) issues.push({ path: `links[${i}]`, message: 'A link cannot start and end at the same node', targetId: l.id });
  });
  const t = design.water.tempC;
  if (!Number.isFinite(t) || t < WATER_T_MIN_C || t > WATER_T_MAX_C) {
    issues.push({ path: 'water.tempC', message: `Water temperature must be between ${WATER_T_MIN_C} and ${WATER_T_MAX_C} °C` });
  }
  if (!design.nodes.some((n) => n.kind === 'pond')) {
    issues.push({ path: 'nodes', message: 'A design needs at least one pond node' });
  }
  for (const id of Object.keys(design.layout ?? {})) {
    if (!ids.has(id)) issues.push({ path: `layout.${id}`, message: `Layout entry for unknown id "${id}"` });
  }
  return issues;
}
