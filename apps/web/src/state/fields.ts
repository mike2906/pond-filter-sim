import type { Link, Node, Stage } from '@pond/engine';
import type { Quantity } from '../units/quantities';

/** One numeric input on an element. `path` is dotted, relative to the node or link. */
export interface FieldDesc {
  path: string;
  label: string;
  quantity: Quantity;
  min?: number;
  max?: number;
  integer?: boolean;
  hint?: string;
  /** Where the field is edited most naturally. Plan = footprint, section = heights. */
  view?: 'plan' | 'section';
}

const POS = 1e-4;

export function nodeFields(n: Node): FieldDesc[] {
  switch (n.kind) {
    case 'pond':
      return [
        { path: 'levelM', label: 'Surface level', quantity: 'elevation', hint: 'Relative to the pond datum, normally 0.', view: 'section' },
        { path: 'floorM', label: 'Deepest point', quantity: 'elevation', max: 0, view: 'section' },
        { path: 'surfaceAreaM2', label: 'Surface area', quantity: 'area', min: POS, view: 'plan' },
        { path: 'volumeM3', label: 'Volume', quantity: 'volume', min: POS, hint: 'Used for turnover.' },
      ];
    case 'junction':
      return [{ path: 'elevationM', label: 'Elevation', quantity: 'elevation', view: 'section' }];
    case 'chamber':
      return [
        ...(n.shape.type === 'rect'
          ? [
              { path: 'shape.lengthM', label: 'Length (along flow)', quantity: 'length', min: 0.05, view: 'plan' } as FieldDesc,
              { path: 'shape.widthM', label: 'Width', quantity: 'length', min: 0.05, view: 'plan' } as FieldDesc,
            ]
          : [{ path: 'shape.diameterM', label: 'Diameter', quantity: 'length', min: 0.05, view: 'plan' } as FieldDesc]),
        { path: 'floorM', label: 'Floor', quantity: 'elevation', view: 'section' },
        { path: 'wallCrestM', label: 'Wall top', quantity: 'elevation', hint: 'Water above this overflows.', view: 'section' },
      ];
  }
}

function geometryFields(prefix: string, g: Extract<Stage, { geometry: unknown }>['geometry']): FieldDesc[] {
  return g.type === 'planar'
    ? [
        { path: `${prefix}.flowAreaM2`, label: 'Flow face area', quantity: 'area', min: POS, view: 'plan' },
        { path: `${prefix}.depthM`, label: 'Bed depth (in flow direction)', quantity: 'length', min: POS },
      ]
    : [
        { path: `${prefix}.outerRadiusM`, label: 'Outer radius', quantity: 'diameter', min: POS, view: 'plan' },
        { path: `${prefix}.innerRadiusM`, label: 'Inner radius', quantity: 'diameter', min: POS, view: 'plan' },
        { path: `${prefix}.activeHeightM`, label: 'Active height', quantity: 'length', min: POS, view: 'section' },
      ];
}

export function stageFields(s: Stage): FieldDesc[] {
  const p = 'stage';
  switch (s.type) {
    case 'vortex':
      return [{ path: `${p}.diameterM`, label: 'Diameter', quantity: 'length', min: 0.1 }];
    case 'settlement':
      return [{ path: `${p}.baffles`, label: 'Baffles', quantity: 'count', min: 0, integer: true }];
    case 'sieve':
      return [
        { path: `${p}.apertureM`, label: 'Aperture', quantity: 'fine', min: 1e-5 },
        { path: `${p}.widthM`, label: 'Screen width', quantity: 'length', min: 0.05 },
        { path: `${p}.openAreaFraction`, label: 'Open area', quantity: 'fraction', min: 0.01, max: 1 },
      ];
    case 'drum':
      return [
        { path: `${p}.meshM`, label: 'Mesh', quantity: 'fine', min: 1e-6 },
        { path: `${p}.screenAreaM2`, label: 'Wetted screen area', quantity: 'area', min: POS },
        { path: `${p}.openAreaFraction`, label: 'Open area', quantity: 'fraction', min: 0.01, max: 1 },
        { path: `${p}.backwashSetpointM`, label: 'Backwash at level difference', quantity: 'head', min: 0 },
        { path: `${p}.washVolumeM3`, label: 'Water per wash', quantity: 'litres', min: 0 },
      ];
    case 'brushes':
      return [
        { path: `${p}.count`, label: 'Brush count', quantity: 'count', min: 1, integer: true, view: 'plan' },
        { path: `${p}.rows`, label: 'Rows', quantity: 'count', min: 1, integer: true, view: 'plan' },
        { path: `${p}.brushDiameterM`, label: 'Brush diameter', quantity: 'diameter', min: 0.01, view: 'plan' },
        { path: `${p}.spacingM`, label: 'Gap between brushes', quantity: 'diameter', min: 0, view: 'plan' },
        { path: `${p}.lengthM`, label: 'Brush length', quantity: 'length', min: 0.05, view: 'section' },
        { path: `${p}.bristleDiameterM`, label: 'Bristle diameter', quantity: 'fine', min: 1e-5 },
      ];
    case 'matting':
      return [
        { path: `${p}.fibreDiameterM`, label: 'Fibre diameter', quantity: 'fine', min: 1e-5 },
        { path: `${p}.porosity`, label: 'Porosity', quantity: 'fraction', min: 0.3, max: 0.995 },
        ...geometryFields(`${p}.geometry`, s.geometry),
      ];
    case 'static-media':
      return [
        { path: `${p}.voidage`, label: 'Voidage', quantity: 'fraction', min: 0.2, max: 0.98 },
        { path: `${p}.equivalentDiameterM`, label: 'Equivalent diameter', quantity: 'fine', min: 1e-4 },
        { path: `${p}.sphericity`, label: 'Sphericity', quantity: 'ratio', min: 0.1, max: 1 },
        ...geometryFields(`${p}.geometry`, s.geometry),
      ];
    case 'moving-bed':
      return [
        { path: `${p}.fillFraction`, label: 'Fill', quantity: 'fraction', min: 0, max: 0.7 },
        { path: `${p}.screenAreaM2`, label: 'Outlet screen area', quantity: 'area', min: POS },
        { path: `${p}.screenOpenFraction`, label: 'Screen open area', quantity: 'fraction', min: 0.01, max: 1 },
        { path: `${p}.aerationAirFlowM3s`, label: 'Aeration', quantity: 'airflow', min: 0 },
      ];
    case 'beads':
      return [
        { path: `${p}.beadDiameterM`, label: 'Bead diameter', quantity: 'fine', min: 1e-4 },
        { path: `${p}.voidage`, label: 'Voidage', quantity: 'fraction', min: 0.2, max: 0.6 },
        { path: `${p}.bedDepthM`, label: 'Bed depth', quantity: 'length', min: POS },
        { path: `${p}.bedAreaM2`, label: 'Bed area', quantity: 'area', min: POS },
        { path: `${p}.valveK`, label: 'Multiport valve K', quantity: 'ratio', min: 0 },
      ];
    case 'gravel-bed':
      return [
        { path: `${p}.particleDiameterM`, label: 'Gravel size', quantity: 'fine', min: 1e-4 },
        { path: `${p}.voidage`, label: 'Voidage', quantity: 'fraction', min: 0.2, max: 0.6 },
        ...geometryFields(`${p}.geometry`, s.geometry),
      ];
    case 'generic':
      return [
        { path: `${p}.k`, label: 'Loss coefficient K', quantity: 'ratio', min: 0 },
        { path: `${p}.referenceAreaM2`, label: 'Reference area', quantity: 'area', min: POS },
        { path: `${p}.fixedHeadLossM`, label: 'Fixed loss', quantity: 'head', min: 0 },
      ];
  }
}

export function linkFields(l: Link): FieldDesc[] {
  switch (l.kind) {
    case 'pipe':
      return [
        { path: 'internalDiameterM', label: 'Bore (internal diameter)', quantity: 'diameter', min: 0.005, max: 0.25, hint: 'Internal, not nominal: 110 mm PVC is about 103.6 mm bore.' },
        { path: 'lengthM', label: 'Length', quantity: 'length', min: 0.01, view: 'plan' },
        { path: 'inletElevationM', label: 'Inlet elevation', quantity: 'elevation', view: 'section' },
        { path: 'outletElevationM', label: 'Outlet elevation', quantity: 'elevation', view: 'section' },
        { path: 'roughnessM', label: 'Roughness', quantity: 'roughness', min: 0, hint: 'PVC ≈ 0.0015 mm.' },
        { path: 'parallelCount', label: 'Identical pipes in parallel', quantity: 'count', min: 1, integer: true },
      ];
    case 'opening':
      return [
        ...(l.shape.type === 'circle'
          ? [{ path: 'shape.diameterM', label: 'Diameter', quantity: 'diameter', min: 0.005 } as FieldDesc]
          : [
              { path: 'shape.widthM', label: 'Width', quantity: 'diameter', min: 0.005 } as FieldDesc,
              { path: 'shape.heightM', label: 'Height', quantity: 'diameter', min: 0.005 } as FieldDesc,
            ]),
        { path: 'invertM', label: 'Bottom edge', quantity: 'elevation', view: 'section' },
        { path: 'count', label: 'Number of openings', quantity: 'count', min: 1, integer: true },
        { path: 'dischargeCoefficient', label: 'Discharge coefficient', quantity: 'ratio', min: 0.1, max: 1, hint: 'Sharp-edged hole ≈ 0.61.' },
      ];
    case 'weir':
      return [
        { path: 'crestM', label: 'Crest', quantity: 'elevation', view: 'section' },
        { path: 'widthM', label: 'Crest width', quantity: 'length', min: 0.01 },
      ];
    case 'grille':
      return [
        { path: 'faceAreaM2', label: 'Face area', quantity: 'area', min: POS },
        { path: 'barThicknessM', label: 'Bar thickness', quantity: 'diameter', min: 0.0005 },
        { path: 'barSpacingM', label: 'Clear gap between bars', quantity: 'diameter', min: 0.001 },
        { path: 'shapeFactor', label: 'Bar shape factor', quantity: 'ratio', min: 0.5, max: 3, hint: 'Kirschmer: 2.42 square bars, 1.79 round bars.' },
        { path: 'angleDeg', label: 'Angle from horizontal', quantity: 'angle', min: 10, max: 90 },
        { path: 'blockedFraction', label: 'Blocked', quantity: 'fraction', min: 0, max: 0.95 },
      ];
    case 'valve':
      return [
        { path: 'internalDiameterM', label: 'Bore', quantity: 'diameter', min: 0.005 },
        { path: 'openFraction', label: 'Open', quantity: 'fraction', min: 0, max: 1 },
      ];
    case 'pump':
      return [
        { path: 'speedFraction', label: 'Speed', quantity: 'fraction', min: 0.1, max: 1.2, hint: 'Affinity laws scale the curve.' },
        { path: 'intakeElevationM', label: 'Intake elevation', quantity: 'elevation', view: 'section' },
      ];
    case 'airlift':
      return [
        { path: 'riserInternalDiameterM', label: 'Riser bore', quantity: 'diameter', min: 0.01 },
        { path: 'inletElevationM', label: 'Riser bottom', quantity: 'elevation', view: 'section' },
        { path: 'injectionElevationM', label: 'Air injection', quantity: 'elevation', view: 'section' },
        ...(l.outlet.type === 'vented-tee'
          ? [{ path: 'outlet.teeElevationM', label: 'Tee elevation', quantity: 'elevation', view: 'section' } as FieldDesc]
          : [{ path: 'outlet.elevationM', label: 'Outlet elevation', quantity: 'elevation', view: 'section' } as FieldDesc]),
        ...(l.airSupply.type === 'fixed' ? [{ path: 'airSupply.airFlowM3s', label: 'Air flow', quantity: 'airflow', min: 0 } as FieldDesc] : []),
        { path: 'count', label: 'Identical airlifts', quantity: 'count', min: 1, integer: true },
      ];
    case 'stage':
      return stageFields(l.stage);
  }
}

export function elementFields(el: Node | Link): FieldDesc[] {
  return 'from' in el ? linkFields(el) : nodeFields(el);
}

/** Default value shown for optional fields that are absent from the design. */
export const OPTIONAL_DEFAULTS: Record<string, number> = {
  parallelCount: 1,
  count: 1,
  dischargeCoefficient: 0.61,
  'stage.k': 0,
  'stage.referenceAreaM2': 1,
  'stage.fixedHeadLossM': 0,
};
