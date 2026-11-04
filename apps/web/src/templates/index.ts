import type { CurvePoint, Design } from '@pond/engine';
import { swimPondBridge, twinRadialModules } from '@pond/engine/fixtures/reference-designs';
import { simpleGravityAirlift } from '@pond/engine/fixtures/simple-gravity-airlift';

const m3h = (q: number) => q / 3600;
const curve = (pts: [number, number][]): CurvePoint[] => pts.map(([q, h]) => ({ flowM3s: m3h(q), headM: h }));

/** A mid-size pond pump, roughly 13 m³/h at zero head. Illustrative, not a real model. */
const PUMP_13 = curve([[0, 4.6], [3, 4.2], [6, 3.5], [9, 2.5], [12, 1.1], [13.5, 0.3]]);
/** Illustrative power draw for PUMP_13, W against flow. */
const POWER_13 = [[0, 70], [6, 95], [12, 115], [13.5, 118]].map(([q, w]) => ({ flowM3s: m3h(q!), watts: w! }));
/** A pressure-capable pump for bead filters. Illustrative. */
const PUMP_BEAD = curve([[0, 9], [4, 8.2], [8, 6.8], [12, 4.6], [16, 1.6]]);

const gravityPump: Design = {
  schemaVersion: 1,
  name: 'Gravity-fed multi-chamber, pump return',
  water: { tempC: 15 },
  nodes: [
    { id: 'pond', kind: 'pond', name: 'Pond', levelM: 0, surfaceAreaM2: 24, volumeM3: 30, floorM: -1.5 },
    { id: 'vortex', kind: 'chamber', name: 'Vortex', shape: { type: 'round', diameterM: 0.8 }, floorM: -1.1, wallCrestM: 0.1 },
    { id: 'brushes', kind: 'chamber', name: 'Brushes', shape: { type: 'rect', lengthM: 0.7, widthM: 0.7 }, floorM: -0.9, wallCrestM: 0.1 },
    { id: 'k1', kind: 'chamber', name: 'Static K1', shape: { type: 'rect', lengthM: 0.7, widthM: 0.7 }, floorM: -0.9, wallCrestM: 0.1 },
    { id: 'pump-bay', kind: 'chamber', name: 'Pump chamber', shape: { type: 'rect', lengthM: 0.5, widthM: 0.7 }, floorM: -0.9, wallCrestM: 0.1 },
    { id: 'return-tee', kind: 'junction', name: 'Return manifold', elevationM: 0.15 },
  ],
  links: [
    {
      id: 'drain', kind: 'pipe', from: 'pond', to: 'vortex', name: 'Bottom drain line',
      internalDiameterM: 0.1036, lengthM: 5, roughnessM: 1.5e-6,
      fittings: [{ type: 'bottom-drain-dome', count: 1 }, { type: 'elbow-90-long', count: 2 }, { type: 'exit', count: 1 }],
      inletElevationM: -1.5, outletElevationM: -0.85,
    },
    { id: 'vortex-out', kind: 'opening', name: 'Vortex outlet', from: 'vortex', to: 'brushes', shape: { type: 'circle', diameterM: 0.1036 }, invertM: -0.35 },
    {
      id: 'brush-bank', kind: 'stage', name: 'Brush bank', from: 'brushes', to: 'k1', direction: 'cross',
      stage: { type: 'brushes', brushDiameterM: 0.15, bristleDiameterM: 0.0004, count: 12, rows: 3, spacingM: 0.02, lengthM: 0.6 },
    },
    {
      id: 'k1-bed', kind: 'stage', name: 'K1 bed', from: 'k1', to: 'pump-bay', direction: 'up',
      stage: { type: 'static-media', media: 'k1', voidage: 0.8, equivalentDiameterM: 0.009, sphericity: 0.6, floating: true, geometry: { type: 'planar', flowAreaM2: 0.49, depthM: 0.35 } },
    },
    { id: 'pump', kind: 'pump', name: 'Return pump', from: 'pump-bay', to: 'return-tee', model: 'Generic 13 m³/h', curve: PUMP_13, power: POWER_13, speedFraction: 1, intakeElevationM: -0.8 },
    {
      id: 'return', kind: 'pipe', from: 'return-tee', to: 'pond', name: 'Return line',
      internalDiameterM: 0.0438, lengthM: 8, roughnessM: 1.5e-6,
      fittings: [{ type: 'elbow-90-short', count: 3 }, { type: 'ball-valve', count: 1 }, { type: 'exit', count: 1 }],
      inletElevationM: 0.15, outletElevationM: -0.1,
    },
  ],
  layout: {
    pond: { xM: 0, yM: 0 },
    vortex: { xM: 4, yM: 0 },
    brushes: { xM: 5, yM: 0 },
    k1: { xM: 5.8, yM: 0 },
    'pump-bay': { xM: 6.5, yM: 0 },
    'return-tee': { xM: 6.5, yM: 1.2 },
  },
};

const pumpBeads: Design = {
  schemaVersion: 1,
  name: 'Pump-fed bead filter',
  water: { tempC: 15 },
  nodes: [
    { id: 'pond', kind: 'pond', name: 'Pond', levelM: 0, surfaceAreaM2: 18, volumeM3: 20, floorM: -1.2 },
    { id: 'bead-in', kind: 'junction', name: 'Bead filter inlet', elevationM: 0.4 },
    { id: 'bead-out', kind: 'junction', name: 'Bead filter outlet', elevationM: 0.9 },
  ],
  links: [
    { id: 'pump', kind: 'pump', name: 'Feed pump', from: 'pond', to: 'bead-in', model: 'Generic pressure pump', curve: PUMP_BEAD, speedFraction: 1, intakeElevationM: -1.0 },
    {
      id: 'beads', kind: 'stage', name: 'Bead bed', from: 'bead-in', to: 'bead-out', direction: 'down',
      stage: { type: 'beads', beadDiameterM: 0.003, voidage: 0.38, bedDepthM: 0.45, bedAreaM2: 0.2, valveK: 6 },
    },
    {
      id: 'return', kind: 'pipe', from: 'bead-out', to: 'pond', name: 'Return to pond',
      internalDiameterM: 0.0438, lengthM: 6, roughnessM: 1.5e-6,
      fittings: [{ type: 'elbow-90-short', count: 4 }, { type: 'exit', count: 1 }],
      inletElevationM: 0.9, outletElevationM: 0,
    },
  ],
  layout: {
    pond: { xM: 0, yM: 0 },
    'bead-in': { xM: 3.5, yM: 0 },
    'bead-out': { xM: 4.3, yM: 0 },
  },
};

const blank: Design = {
  schemaVersion: 1,
  name: 'New design',
  water: { tempC: 15 },
  nodes: [{ id: 'pond', kind: 'pond', name: 'Pond', levelM: 0, surfaceAreaM2: 20, volumeM3: 25, floorM: -1.2 }],
  links: [],
  layout: { pond: { xM: 0, yM: 0 } },
};

export interface Template {
  id: string;
  name: string;
  blurb: string;
  design: Design;
}

export const TEMPLATES: Template[] = [
  { id: 'gravity-pump', name: 'Gravity-fed, pump return', blurb: 'Bottom drain, vortex, brushes and K1, with a pump back to the pond.', design: gravityPump },
  { id: 'pump-beads', name: 'Pump-fed bead filter', blurb: 'A pump pushes water through a pressurised bead filter and back.', design: pumpBeads },
  { id: 'gravity-airlift', name: 'Gravity-fed, airlift return', blurb: 'Airlift return. Airlift maths is a placeholder until milestone 3.', design: simpleGravityAirlift },
  { id: 'ref-swim-bridge', name: 'Your swim-pond filter bridge', blurb: 'Two pond zones, forebay, brush chamber, main return and wetland branch. Airlifts are stood in by low-head pumps for now.', design: swimPondBridge },
  { id: 'ref-twin-radial', name: 'Your twin radial modules', blurb: 'Prefilter feeding two radial media modules in parallel. Airlifts are stood in by low-head pumps for now.', design: twinRadialModules() },
  { id: 'blank', name: 'Blank', blurb: 'Just a pond. Add chambers and connections from the inspector.', design: blank },
];

export const DEFAULT_TEMPLATE = TEMPLATES[0]!;
